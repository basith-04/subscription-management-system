import type { Pool } from 'pg'
import { writeAudit, type AuditEntry } from '../../lib/audit.js'
import { withTransaction, type Queryable } from '../../lib/db.js'

export interface RoleRecord {
  id: number
  name: string
}

export interface UserRecord {
  id: number
  email: string
  password_hash: string
  full_name: string
  is_active: boolean
  role_id: number
  role: string
  customer_id: number | null
}

export interface InsertUserInput {
  role_id: number
  email: string
  password_hash: string
  full_name: string
}

export interface InsertCustomerInput {
  user_id: number
  name: string
  email: string
  company_name: string | null
  phone: string | null
}

interface RoleRow {
  id: number
  name: string
}

interface UserRow {
  id: string | number
  email: string
  password_hash: string
  full_name: string
  is_active: boolean
  role_id: number
  role: string
  customer_id: string | number | null
}

interface InsertedUserRow {
  id: string | number
  email: string
  full_name: string
}

interface InsertedCustomerRow {
  id: string | number
}

export interface AuthRepository {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  findRoleByName(tx: Queryable, name: string): Promise<RoleRecord | null>
  findUserByEmail(tx: Queryable, email: string): Promise<UserRecord | null>
  findUserById(tx: Queryable, id: number): Promise<UserRecord | null>
  customerEmailExists(tx: Queryable, email: string): Promise<boolean>
  insertUser(
    tx: Queryable,
    input: InsertUserInput,
  ): Promise<{ id: number; email: string; full_name: string }>
  insertCustomer(
    tx: Queryable,
    input: InsertCustomerInput,
  ): Promise<{ id: number }>
  updateLastLogin(tx: Queryable, userId: number): Promise<void>
  insertAuditLog(tx: Queryable, entry: AuditEntry): Promise<void>
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: Number(row.id),
    email: row.email,
    password_hash: row.password_hash,
    full_name: row.full_name,
    is_active: row.is_active,
    role_id: Number(row.role_id),
    role: row.role,
    customer_id:
      row.customer_id === null ? null : Number(row.customer_id),
  }
}

const USER_SELECT = `
  SELECT u.id,
         u.email::text AS email,
         u.password_hash,
         u.full_name,
         u.is_active,
         u.role_id,
         r.name AS role,
         c.id AS customer_id
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN customers c ON c.user_id = u.id
`

export function createAuthRepository(pool: Pool): AuthRepository {
  return {
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return withTransaction(pool, fn)
    },

    async findRoleByName(tx, name) {
      const result = await tx.query<RoleRow>(
        'SELECT id, name FROM roles WHERE name = $1',
        [name],
      )
      const row = result.rows[0]
      return row ? { id: Number(row.id), name: row.name } : null
    },

    async findUserByEmail(tx, email) {
      const result = await tx.query<UserRow>(
        `${USER_SELECT} WHERE u.email = $1`,
        [email],
      )
      const row = result.rows[0]
      return row ? mapUser(row) : null
    },

    async customerEmailExists(tx, email) {
      const result = await tx.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM customers WHERE email = $1) AS exists',
        [email],
      )
      return result.rows[0]?.exists ?? false
    },

    async findUserById(tx, id) {
      const result = await tx.query<UserRow>(
        `${USER_SELECT} WHERE u.id = $1`,
        [id],
      )
      const row = result.rows[0]
      return row ? mapUser(row) : null
    },

    async insertUser(tx, input) {
      const result = await tx.query<InsertedUserRow>(
        `INSERT INTO users (role_id, email, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email::text AS email, full_name`,
        [
          input.role_id,
          input.email,
          input.password_hash,
          input.full_name,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error('User insert did not return a row')
      }

      return {
        id: Number(row.id),
        email: row.email,
        full_name: row.full_name,
      }
    },

    async insertCustomer(tx, input) {
      const result = await tx.query<InsertedCustomerRow>(
        `INSERT INTO customers (user_id, name, email, company_name, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          input.user_id,
          input.name,
          input.email,
          input.company_name,
          input.phone,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error('Customer insert did not return a row')
      }

      return { id: Number(row.id) }
    },

    async updateLastLogin(tx, userId) {
      await tx.query(
        `UPDATE users
            SET last_login_at = now(), updated_at = now()
          WHERE id = $1`,
        [userId],
      )
    },

    async insertAuditLog(tx, entry) {
      await writeAudit(tx, entry)
    },
  }
}
