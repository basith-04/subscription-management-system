import type { Queryable } from '../../lib/db.js'
import type { TaxRuleRecord } from '../../db/client.js'

const columns = `id::text, name, rate::text, is_active,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`

export const taxesRepository = {
  async list(db: Queryable, filter?: { isActive?: boolean }): Promise<TaxRuleRecord[]> {
    const r = await db.query<TaxRuleRecord>(`SELECT ${columns} FROM tax_rules WHERE ($1::boolean IS NULL OR is_active=$1) ORDER BY name, id`, [filter?.isActive ?? null])
    return r.rows
  },
  async findById(db: Queryable, id: string, lock = false): Promise<TaxRuleRecord | null> {
    const r = await db.query<TaxRuleRecord>(`SELECT ${columns} FROM tax_rules WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])
    return r.rows[0] ?? null
  },
  async findByName(db: Queryable, name: string): Promise<TaxRuleRecord | null> {
    const r = await db.query<TaxRuleRecord>(`SELECT ${columns} FROM tax_rules WHERE lower(name)=lower($1)`, [name])
    return r.rows[0] ?? null
  },
  async create(db: Queryable, data: { name: string; rate: string; is_active?: boolean }): Promise<TaxRuleRecord> {
    const r = await db.query<TaxRuleRecord>(`INSERT INTO tax_rules (name, rate, is_active) VALUES ($1,$2,$3) RETURNING ${columns}`, [data.name, data.rate, data.is_active ?? true])
    return r.rows[0]!
  },
  async update(db: Queryable, id: string, data: { name?: string; rate?: string; is_active?: boolean }): Promise<TaxRuleRecord | null> {
    const r = await db.query<TaxRuleRecord>(`UPDATE tax_rules SET name=COALESCE($2,name), rate=COALESCE($3,rate), is_active=COALESCE($4,is_active), updated_at=now() WHERE id=$1 RETURNING ${columns}`, [id, data.name ?? null, data.rate ?? null, data.is_active ?? null])
    return r.rows[0] ?? null
  },
  async delete(db: Queryable, id: string): Promise<boolean> {
    const r = await db.query('DELETE FROM tax_rules WHERE id=$1', [id])
    return (r.rowCount ?? 0) > 0
  },
}
