import { query, isPgError } from '../../lib/db.js'

export interface UserRow {
  id: string
  email: string
  full_name: string
  is_active: boolean
  role: 'admin' | 'staff' | 'customer'
  created_at: Date
  updated_at: Date
}

export async function listUsers(filters: { role?: string; is_active?: boolean; q?: string; limit: number; offset: number }) {
  const conditions: string[] = ["r.name != 'customer'"]
  const params: unknown[] = []

  if (filters.role) {
    params.push(filters.role)
    conditions.push(`r.name = $${params.length}`)
  }
  if (filters.is_active !== undefined) {
    params.push(filters.is_active)
    conditions.push(`u.is_active = $${params.length}`)
  }
  if (filters.q) {
    params.push(`%${filters.q}%`)
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email::text ILIKE $${params.length})`)
  }
  const where = `WHERE ${conditions.join(' AND ')}`

  const countRes = await query<{ count: string }>(
    `SELECT count(*) FROM users u JOIN roles r ON u.role_id = r.id ${where}`, params
  )
  const total = Number(countRes.rows[0]?.count ?? 0)

  params.push(filters.limit, filters.offset)
  const listRes = await query<UserRow>(
    `SELECT u.id::text, u.email, u.full_name, u.is_active, r.name as role, u.created_at, u.updated_at
     FROM users u JOIN roles r ON u.role_id = r.id
     ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  return { rows: listRes.rows, total }
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT u.id::text, u.email, u.full_name, u.is_active, r.name as role, u.created_at, u.updated_at
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`, [id]
  )
  return rows[0] ?? null
}

export async function insertStaff(input: { full_name: string; email: string; password_hash: string; created_by: number }) {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (role_id, email, password_hash, full_name, created_by)
     VALUES ((SELECT id FROM roles WHERE name = 'staff'), $1, $2, $3, $4)
     RETURNING id::text, email, full_name, is_active, 'staff' as role, created_at, updated_at`,
    [input.email, input.password_hash, input.full_name, input.created_by]
  )
  return rows[0]!
}

export async function updateUser(id: number, patch: Record<string, unknown>) {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(patch)) {
    params.push(val)
    sets.push(`"${key}" = $${params.length}`)
  }
  params.push(id)
  const { rows } = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING id::text, email, full_name, is_active,
       (SELECT name FROM roles WHERE id = users.role_id) as role,
       created_at, updated_at`,
    params
  )
  return rows[0] ?? null
}

export async function countActiveAdmins(tx: any, excludeId?: number): Promise<number> {
  let sql = `SELECT count(*) FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' AND u.is_active = true`
  const params: any[] = []
  if (excludeId) {
    params.push(excludeId)
    sql += ` AND u.id != $1`
  }
  const res = await tx.query(sql, params)
  return Number(res.rows[0].count)
}
