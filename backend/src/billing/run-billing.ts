import type { Pool } from 'pg'
import { withTransaction, isPgError, type Queryable } from '../lib/db.js'
import { todayInAppTimezone } from '../lib/dates.js'
import { createDraftInvoice } from '../modules/invoices/index.js'
import { buildDraftInvoice } from './invoice-builder.js'
import { periodStart, periodEnd } from './calculators/periods.js'

export type BillingTrigger = 'scheduler' | 'manual' | 'startup_catchup'

export interface RunBillingOpts {
  asOf?: string
  trigger?: BillingTrigger
  triggeredBy?: number | null
  runId?: number
}

export async function createBillingRun(pool: Pool, trigger: BillingTrigger, asOf: string, triggeredBy: number | null = null): Promise<number> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO billing_runs (trigger, run_date, triggered_by, status) VALUES ($1, $2, $3, 'running') RETURNING id`,
    [trigger, asOf, triggeredBy]
  )
  return Number(res.rows[0]!.id)
}

/**
 * Builds and inserts exactly one invoice for a subscription, and advances the cursor.
 * Throws 23505 if the period is already billed.
 */
export async function billOnePeriod(tx: Queryable, subscriptionId: number, periodIndex: number, asOf: string, billingRunId: number | null): Promise<void> {
  // 1. Load subscription with joins
  const subQuery = await tx.query(
    `SELECT s.*, 
            c.name as customer_name, c.email as customer_email, c.tax_id, 
            c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country,
            pt.name as payment_term_name, pt.due_days,
            p.billing_frequency
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     JOIN payment_terms pt ON pt.id = s.payment_term_id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.id = $1 FOR UPDATE`,
    [subscriptionId]
  )
  if (subQuery.rows.length === 0) throw new Error('Subscription not found')
  const sub = subQuery.rows[0]

  const anchorDate = sub.billing_anchor_date || sub.start_date
  const pStart = periodStart(anchorDate, periodIndex, sub.billing_frequency)
  const pEnd = periodEnd(anchorDate, periodIndex, sub.billing_frequency)

  if (pStart > sub.expiry_date) {
    await tx.query(`UPDATE subscriptions SET next_billing_date = NULL, last_billing_error = NULL WHERE id = $1`, [sub.id])
    return
  }

  // 2. Load items and tax rules
  const itemsQuery = await tx.query(`SELECT * FROM subscription_items WHERE subscription_id = $1 ORDER BY sort_order`, [sub.id])
  const taxRulesQuery = await tx.query(`SELECT id, name, rate::text FROM tax_rules`)
  const taxRules = Object.fromEntries(taxRulesQuery.rows.map(r => [r.id, { name: r.name, rate: r.rate }]))

  // 3. Build DTO
  const data = buildDraftInvoice({
    subscription: { id: sub.id, customer_id: sub.customer_id },
    customer: {
      name: sub.customer_name, email: sub.customer_email, tax_id: sub.tax_id,
      address_line1: sub.address_line1, address_line2: sub.address_line2,
      city: sub.city, state: sub.state, postal_code: sub.postal_code, country: sub.country
    },
    payment_term: { name: sub.payment_term_name, due_days: sub.due_days },
    items: itemsQuery.rows,
    tax_rules: taxRules,
    period_start: pStart,
    period_end: pEnd,
    issue_date: asOf,
    billing_run_id: billingRunId
  })

  // 4. Insert
  await createDraftInvoice(tx, data)

  // 5. Advance cursor
  const nextStart = periodStart(anchorDate, periodIndex + 1, sub.billing_frequency)
  const newNextBilling = nextStart <= sub.expiry_date ? nextStart : null
  
  await tx.query(
    `UPDATE subscriptions SET period_index = period_index + 1, next_billing_date = $1, last_billing_error = NULL, last_billing_attempt_at = now() WHERE id = $2`,
    [newNextBilling, sub.id]
  )
}

export async function runBilling(pool: Pool, opts: RunBillingOpts = {}): Promise<number> {
  const asOf = opts.asOf ?? todayInAppTimezone()
  const runId = opts.runId ?? await createBillingRun(pool, opts.trigger ?? 'scheduler', asOf, opts.triggeredBy ?? null)
  
  let scanned = 0
  let created = 0
  let skipped = 0
  let errors = 0

  try {
    while (true) {
      const processed = await withTransaction(pool, async (tx) => {
        const subQuery = await tx.query(
          `SELECT s.id, s.period_index, s.billing_anchor_date, s.start_date, s.expiry_date, s.billing_frequency
           FROM subscriptions s
           WHERE s.status = 'active' AND s.paused_at IS NULL AND s.next_billing_date <= $1
             AND (s.last_billing_attempt_at IS NULL OR s.last_billing_attempt_at < $2)
           ORDER BY s.next_billing_date, s.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [asOf, new Date().toISOString()]
        )
        
        if (subQuery.rows.length === 0) return false
        scanned++
        const sub = subQuery.rows[0]
        
        try {
          await billOnePeriod(tx, sub.id, sub.period_index, asOf, runId)
          created++
        } catch (err) {
          if (isPgError(err) && err.code === '23505' && err.constraint === 'uq_invoices_subscription_period_start') {
            skipped++
            await tx.query(`UPDATE subscriptions SET last_billing_attempt_at = now() WHERE id = $1`, [sub.id])
          } else {
            errors++
            await tx.query(`UPDATE subscriptions SET last_billing_attempt_at = now(), last_billing_error = $1 WHERE id = $2`, [(err as Error).message, sub.id])
          }
        }
        return true
      })
      if (!processed) break
    }
    
    await pool.query(
      `UPDATE billing_runs SET status = $1, finished_at = now(), subscriptions_scanned = $2, invoices_created = $3, invoices_skipped = $4, errors_count = $5 WHERE id = $6`,
      [errors > 0 ? 'completed_with_errors' : 'completed', scanned, created, skipped, errors, runId]
    )
  } catch (error) {
    await pool.query(
      `UPDATE billing_runs SET status = 'failed', finished_at = now(), subscriptions_scanned = $1, invoices_created = $2, invoices_skipped = $3, errors_count = errors_count + 1 WHERE id = $4`,
      [scanned, created, skipped, runId]
    )
    throw error
  }
  return runId
}
