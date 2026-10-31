import type { Pool } from 'pg'
import { hashPassword } from '../../src/lib/password.js'
import { normalizeEmail } from '../../src/lib/text.js'

export interface CreateUserOptions {
  email: string
  password?: string
  fullName?: string
  role?: 'admin' | 'staff' | 'customer'
  isActive?: boolean
  createCustomer?: boolean
}

export interface CreatedUser {
  id: number
  email: string
  role: string
  customer_id: number | null
}

export async function createUser(
  pool: Pool,
  {
    email,
    password = 'Example!Pass123',
    fullName = 'Test User',
    role = 'customer',
    isActive = true,
    createCustomer = role === 'customer',
  }: CreateUserOptions,
): Promise<CreatedUser> {
  const normalizedEmail = normalizeEmail(email)
  const passwordHash = await hashPassword(password)

  const roleResult = await pool.query<{ id: number }>(
    'SELECT id FROM roles WHERE name = $1',
    [role],
  )
  const roleRow = roleResult.rows[0]
  if (!roleRow) throw new Error(`missing role: ${role}`)

  const userResult = await pool.query<{ id: string | number }>(
    `INSERT INTO users (role_id, email, password_hash, full_name, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [roleRow.id, normalizedEmail, passwordHash, fullName, isActive],
  )
  const userRow = userResult.rows[0]
  if (!userRow) throw new Error('user insert returned no row')

  const userId = Number(userRow.id)
  let customerId: number | null = null

  if (createCustomer) {
    const customerResult = await pool.query<{ id: string | number }>(
      `INSERT INTO customers (user_id, name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, fullName, normalizedEmail],
    )
    const customerRow = customerResult.rows[0]
    if (!customerRow) throw new Error('customer insert returned no row')
    customerId = Number(customerRow.id)
  }

  return {
    id: userId,
    email: normalizedEmail,
    role,
    customer_id: customerId,
  }
}
