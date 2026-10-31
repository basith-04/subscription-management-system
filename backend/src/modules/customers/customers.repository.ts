// SQL queries for customers tables; private to the module.
import type { Queryable } from '../../lib/db.js'
import { ADDRESS_COLUMNS, ADDRESS_KEYS } from './customers.constants.js'
import type { Address } from './customers.schemas.js'

export interface CustomerRow {
  id: string
  user_id: string | null
  name: string
  company_name: string | null
  email: string
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  tax_id: string | null
  notes: string | null
  is_active: boolean
}

const COLUMNS = `id::text AS id, user_id::text AS user_id, name, company_name, email::text AS email, phone,
  address_line1, address_line2, city, state, postal_code, country, tax_id, notes, is_active`

export interface ListFilters {
  q?: string | undefined
  is_active?: boolean | undefined
}

function where(filters: ListFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  if (filters.q) {
    params.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`)
    const n = `$${params.length}`
    clauses.push(`(name ILIKE ${n} OR email::text ILIKE ${n} OR company_name ILIKE ${n})`)
  }
  if (filters.is_active !== undefined) {
    params.push(filters.is_active)
    clauses.push(`is_active = $${params.length}`)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export async function listCustomers(db: Queryable, filters: ListFilters, orderBy: string, limit: number, offset: number) {
  const { sql, params } = where(filters)
  const rows = await db.query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers ${sql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM customers ${sql}`, params)
  return { rows: rows.rows, total: count.rows[0]?.total ?? 0 }
}

export async function findById(db: Queryable, id: number, lock = false): Promise<CustomerRow | null> {
  const res = await db.query<CustomerRow>(`SELECT ${COLUMNS} FROM customers WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
  return res.rows[0] ?? null
}

export interface InsertCustomer {
  name: string
  email: string
  company_name?: string | null | undefined
  phone?: string | null | undefined
  address?: Address | undefined
  tax_id?: string | null | undefined
  notes?: string | null | undefined
}

/** Staff-created customers never get a user_id (D-09: no automatic linking). */
export async function insertCustomer(db: Queryable, input: InsertCustomer): Promise<CustomerRow> {
  const a = input.address ?? {}
  const res = await db.query<CustomerRow>(
    `INSERT INTO customers (name, email, company_name, phone, address_line1, address_line2, city, state,
                            postal_code, country, tax_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${COLUMNS}`,
    [
      input.name, input.email, input.company_name ?? null, input.phone ?? null,
      a.line1 ?? null, a.line2 ?? null, a.city ?? null, a.state ?? null, a.postal_code ?? null, a.country ?? null,
      input.tax_id ?? null, input.notes ?? null,
    ],
  )
  return res.rows[0]!
}

/** Column → value map of fields to change (already mapped from the API shape). */
export async function updateColumns(db: Queryable, id: number, changes: Record<string, unknown>): Promise<CustomerRow> {
  const entries = Object.entries(changes)
  const sets = entries.map(([column], i) => `${column} = $${i + 1}`)
  const res = await db.query<CustomerRow>(
    `UPDATE customers SET ${sets.join(', ')} WHERE id = $${entries.length + 1} RETURNING ${COLUMNS}`,
    [...entries.map(([, v]) => v), id],
  )
  return res.rows[0]!
}

export async function emailInUse(db: Queryable, email: string, excludeId?: number): Promise<boolean> {
  const res = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM customers WHERE email = $1 AND ($2::bigint IS NULL OR id <> $2)) AS exists`,
    [email, excludeId ?? null],
  )
  return res.rows[0]?.exists ?? false
}

/**
 * Active subscriptions for a customer. F09 owns `subscriptions`; until that table exists this
 * returns null (unknown) instead of failing.
 */
export async function countActiveSubscriptions(db: Queryable, customerId: number): Promise<number | null> {
  const exists = await db.query<{ t: string | null }>(`SELECT to_regclass('subscriptions')::text AS t`)
  if (!exists.rows[0]?.t) return null
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM subscriptions WHERE customer_id = $1 AND status = 'active'`,
    [customerId],
  )
  return res.rows[0]?.n ?? 0
}

export { ADDRESS_COLUMNS, ADDRESS_KEYS }
