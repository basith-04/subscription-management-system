import type { Queryable } from '../../lib/db.js'
import { buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'

export interface RunRow {
  id: string
  trigger: string
  run_date: string
  started_at: Date
  finished_at: Date | null
  status: string
  subscriptions_scanned: number
  invoices_created: number
  invoices_skipped: number
  errors_count: number
  triggered_by: number | null
}

export async function findRun(db: Queryable, id: number): Promise<RunRow | null> {
  const r = await db.query<RunRow>(`SELECT * FROM billing_runs WHERE id = $1`, [id])
  return r.rows[0] ?? null
}

export async function listRuns(db: Queryable, limit: number, offset: number): Promise<{ rows: RunRow[]; total: number }> {
  const list = await db.query<RunRow>(`SELECT * FROM billing_runs ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset])
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM billing_runs`)
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 }
}

export async function findUpcoming(db: Queryable, asOf: string, days: number): Promise<any[]> {
  const r = await db.query(
    `SELECT id, number, next_billing_date, customer_id 
     FROM subscriptions 
     WHERE status = 'active' AND paused_at IS NULL 
       AND next_billing_date <= $1::date + $2::int
     ORDER BY next_billing_date ASC, id ASC`,
    [asOf, days]
  )
  return r.rows
}

export async function findRecentRunningRun(db: Queryable): Promise<RunRow | null> {
  const r = await db.query<RunRow>(
    `SELECT * FROM billing_runs WHERE status = 'running' AND started_at > now() - interval '10 minutes' LIMIT 1`
  )
  return r.rows[0] ?? null
}

export async function getFailedSubscriptionsForRun(db: Queryable, startedAt: Date): Promise<{ id: string, number: string, error: string }[]> {
  const r = await db.query(
    `SELECT id, number, last_billing_error AS error 
     FROM subscriptions 
     WHERE last_billing_error IS NOT NULL AND last_billing_attempt_at >= $1`,
    [startedAt]
  )
  return r.rows
}
