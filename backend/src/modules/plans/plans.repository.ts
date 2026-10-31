// SQL queries for plans tables; private to the module.
import type pg from 'pg'
import { query, type Tx } from '../../lib/db.js'
import type { BillingFrequency } from './plans.constants.js'
import type { CreatePlanInput, PlanProductInput, UpdatePlanInput } from './plans.schemas.js'

/** Anything that can run a query: the pool wrapper or a transaction client. */
export interface Queryable {
  query: <T extends pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<pg.QueryResult<T>>
}

const pool: Queryable = { query: (text, params) => query(text, params ?? []) }
const tx = (client: Tx): Queryable => ({ query: (text, params) => client.query(text, params) })
export { tx as fromTx }

export interface PlanRow {
  id: string
  name: string
  price: string
  billing_frequency: BillingFrequency
  min_quantity: number
  available_from: string
  available_to: string | null
  auto_close_on_end: boolean
  allow_early_close: boolean
  allow_pause: boolean
  allow_renewal: boolean
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  product_count?: number
}

export interface PlanProductRow {
  id: string
  plan_id: string
  product_id: string
  variant_id: string | null
  default_quantity: number
  unit_price_override: string | null
  product_name: string | null
  product_is_active: boolean | null
  variant_label: string | null
  variant_is_active: boolean | null
}

const PLAN_COLUMNS = `
  p.id::text AS id, p.name, p.price::text AS price, p.billing_frequency, p.min_quantity,
  to_char(p.available_from, 'YYYY-MM-DD') AS available_from,
  to_char(p.available_to, 'YYYY-MM-DD') AS available_to,
  p.auto_close_on_end, p.allow_early_close, p.allow_pause, p.allow_renewal,
  p.notes, p.is_active,
  to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`

export interface ListFilters {
  q?: string | undefined
  billing_frequency?: string | undefined
  is_active?: boolean | undefined
  available_on?: string | undefined
}

function buildWhere(filters: ListFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  const add = (clause: string, value: unknown) => {
    params.push(value)
    clauses.push(clause.replace('$?', `$${params.length}`))
  }
  if (filters.q) add(`p.name ILIKE $?`, `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`)
  if (filters.billing_frequency) add(`p.billing_frequency = $?`, filters.billing_frequency)
  if (filters.is_active !== undefined) add(`p.is_active = $?`, filters.is_active)
  if (filters.available_on) {
    // "Sellable on D": active, started, and not yet ended. Open-ended plans never end.
    params.push(filters.available_on)
    const n = `$${params.length}::date`
    clauses.push(`(p.is_active AND p.available_from <= ${n} AND (p.available_to IS NULL OR p.available_to >= ${n}))`)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export async function listPlans(
  filters: ListFilters,
  orderBy: string,
  limit: number,
  offset: number,
): Promise<{ rows: PlanRow[]; total: number }> {
  const { sql, params } = buildWhere(filters)
  const rows = await pool.query<PlanRow>(
    `SELECT ${PLAN_COLUMNS},
            (SELECT count(*)::int FROM plan_products pp WHERE pp.plan_id = p.id) AS product_count
       FROM plans p ${sql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  const count = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM plans p ${sql}`,
    params,
  )
  return { rows: rows.rows, total: count.rows[0]?.total ?? 0 }
}

export async function findPlan(id: number, db: Queryable = pool, lock = false): Promise<PlanRow | null> {
  const res = await db.query<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans p WHERE p.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  )
  return res.rows[0] ?? null
}

export async function insertPlan(input: CreatePlanInput): Promise<PlanRow> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO plans (name, price, billing_frequency, min_quantity, available_from, available_to,
                        auto_close_on_end, allow_early_close, allow_pause, allow_renewal, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text AS id`,
    [
      input.name, input.price, input.billing_frequency, input.min_quantity, input.available_from,
      input.available_to, input.auto_close_on_end, input.allow_early_close, input.allow_pause,
      input.allow_renewal, input.notes, input.is_active,
    ],
  )
  return (await findPlan(Number(res.rows[0]?.id)))!
}

export async function updatePlan(id: number, patch: UpdatePlanInput): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    params.push(value)
    sets.push(`${key} = $${params.length}`) // keys are whitelisted by updatePlanBody (.strict())
  }
  params.push(id)
  await pool.query(
    `UPDATE plans SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
    params,
  )
}

export async function deletePlan(id: number): Promise<boolean> {
  const res = await pool.query(`DELETE FROM plans WHERE id = $1`, [id])
  return (res.rowCount ?? 0) > 0
}

export async function listPlanProducts(planId: number, db: Queryable = pool): Promise<PlanProductRow[]> {
  const res = await db.query<PlanProductRow>(
    `SELECT pp.id::text AS id, pp.plan_id::text AS plan_id, pp.product_id::text AS product_id,
            pp.variant_id::text AS variant_id, pp.default_quantity,
            pp.unit_price_override::text AS unit_price_override,
            pr.name AS product_name, pr.is_active AS product_is_active,
            CASE WHEN pv.id IS NULL THEN NULL ELSE pv.attribute_name || ': ' || pv.attribute_value END AS variant_label,
            pv.is_active AS variant_is_active
       FROM plan_products pp
       JOIN products pr ON pr.id = pp.product_id
  LEFT JOIN product_variants pv ON pv.id = pp.variant_id
      WHERE pp.plan_id = $1
      ORDER BY pp.id`,
    [planId],
  )
  return res.rows
}

export async function findProducts(ids: number[], db: Queryable) {
  const res = await db.query<{ id: string; is_active: boolean }>(
    `SELECT id::text AS id, is_active FROM products WHERE id = ANY($1::bigint[])`,
    [ids],
  )
  return res.rows
}

export async function findVariants(ids: number[], db: Queryable) {
  const res = await db.query<{ id: string; product_id: string; is_active: boolean }>(
    `SELECT id::text AS id, product_id::text AS product_id, is_active
       FROM product_variants WHERE id = ANY($1::bigint[])`,
    [ids],
  )
  return res.rows
}

export async function deletePlanProducts(planId: number, db: Queryable): Promise<void> {
  await db.query(`DELETE FROM plan_products WHERE plan_id = $1`, [planId])
}

export async function insertPlanProduct(planId: number, row: PlanProductInput, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO plan_products (plan_id, product_id, variant_id, default_quantity, unit_price_override)
     VALUES ($1,$2,$3,$4,$5)`,
    [planId, row.product_id, row.variant_id ?? null, row.default_quantity, row.unit_price_override ?? null],
  )
}

export async function touchPlan(planId: number, db: Queryable): Promise<void> {
  await db.query(`UPDATE plans SET updated_at = now() WHERE id = $1`, [planId])
}
