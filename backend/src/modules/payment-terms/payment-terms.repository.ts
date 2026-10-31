import type { Queryable } from '../../lib/db.js'
import type { PaymentTermRecord } from '../../db/client.js'

const columns = `id::text, name, due_days, is_active,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`
export const paymentTermsRepository = {
  async list(db: Queryable, filter?: { isActive?: boolean }): Promise<PaymentTermRecord[]> {
    const r = await db.query<PaymentTermRecord>(`SELECT ${columns} FROM payment_terms WHERE ($1::boolean IS NULL OR is_active=$1) ORDER BY due_days, name, id`, [filter?.isActive ?? null])
    return r.rows
  },
  async findById(db: Queryable, id: string, lock = false): Promise<PaymentTermRecord | null> {
    const r = await db.query<PaymentTermRecord>(`SELECT ${columns} FROM payment_terms WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])
    return r.rows[0] ?? null
  },
  async findByName(db: Queryable, name: string): Promise<PaymentTermRecord | null> {
    const r = await db.query<PaymentTermRecord>(`SELECT ${columns} FROM payment_terms WHERE lower(name)=lower($1)`, [name])
    return r.rows[0] ?? null
  },
  async create(db: Queryable, data: { name: string; due_days: number; is_active?: boolean }): Promise<PaymentTermRecord> {
    const r = await db.query<PaymentTermRecord>(`INSERT INTO payment_terms (name, due_days, is_active) VALUES ($1,$2,$3) RETURNING ${columns}`, [data.name, data.due_days, data.is_active ?? true])
    return r.rows[0]!
  },
  async update(db: Queryable, id: string, data: { name?: string; due_days?: number; is_active?: boolean }): Promise<PaymentTermRecord | null> {
    const r = await db.query<PaymentTermRecord>(`UPDATE payment_terms SET name=COALESCE($2,name), due_days=COALESCE($3,due_days), is_active=COALESCE($4,is_active), updated_at=now() WHERE id=$1 RETURNING ${columns}`, [id, data.name ?? null, data.due_days ?? null, data.is_active ?? null])
    return r.rows[0] ?? null
  },
}
