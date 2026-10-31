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
}

const MAX_CATCHUP_PERIODS = 400

export async function runBilling(pool: Pool, opts: RunBillingOpts = {}): Promise<number> {
  const asOf = opts.asOf ?? todayInAppTimezone()
  const trigger = opts.trigger ?? 'scheduler'
  
  // 1. Create the run log
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO billing_runs (trigger, run_date, status) VALUES ($1, $2, 'running') RETURNING id`,
    [trigger, asOf]
  )
  const runId = Number(runResult.rows[0]!.id)
  
  let scanned = 0
  let created = 0
  let skipped = 0
  let errors = 0

  try {
    // 2. Loop: take one due subscription at a time
    while (true) {
      const processed = await withTransaction(pool, async (tx) => {
        // Find due subscription (F09 doesn't exist yet, so we use raw SQL against the schema)
        // We lock the row to prevent concurrent workers from picking it up.
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
           WHERE s.status = 'active' 
             AND s.paused_at IS NULL 
             AND s.next_billing_date <= $1
             AND (s.last_billing_attempt_at IS NULL OR s.last_billing_attempt_at < $2)
           ORDER BY s.next_billing_date, s.id
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [asOf, new Date().toISOString()]
        )
        
        if (subQuery.rows.length === 0) return false // Done
        scanned++
        
        const sub = subQuery.rows[0]
        const anchorDate = sub.billing_anchor_date || sub.start_date
        
        // Compute period
        const pStart = periodStart(anchorDate, sub.period_index, sub.billing_frequency)
        const pEnd = periodEnd(anchorDate, sub.period_index, sub.billing_frequency)
        
        // Expiry check
        if (pStart > sub.expiry_date) {
          await tx.query(`UPDATE subscriptions SET next_billing_date = NULL, last_billing_error = NULL WHERE id = $1`, [sub.id])
          return true
        }

        // Load items and tax rules
        const itemsQuery = await tx.query(`SELECT * FROM subscription_items WHERE subscription_id = $1 ORDER BY sort_order`, [sub.id])
        const taxRulesQuery = await tx.query(`SELECT id, name, rate::text FROM tax_rules`)
        
        const taxRules = Object.fromEntries(taxRulesQuery.rows.map(r => [r.id, { name: r.name, rate: r.rate }]))
        
        const customer = {
          name: sub.customer_name,
          email: sub.customer_email,
          tax_id: sub.tax_id,
          address_line1: sub.address_line1,
          address_line2: sub.address_line2,
          city: sub.city,
          state: sub.state,
          postal_code: sub.postal_code,
          country: sub.country
        }
        
        const payment_term = { name: sub.payment_term_name, due_days: sub.due_days }
        
        const data = buildDraftInvoice({
          subscription: { id: sub.id, customer_id: sub.customer_id },
          customer,
          payment_term,
          items: itemsQuery.rows,
          tax_rules: taxRules,
          period_start: pStart,
          period_end: pEnd,
          issue_date: asOf,
          billing_run_id: runId
        })
        
        try {
          await createDraftInvoice(tx, data)
          
          // Advance cursor
          const nextStart = periodStart(anchorDate, sub.period_index + 1, sub.billing_frequency)
          const newNextBilling = nextStart <= sub.expiry_date ? nextStart : null
          
          await tx.query(
            `UPDATE subscriptions SET period_index = period_index + 1, next_billing_date = $1, last_billing_error = NULL, last_billing_attempt_at = now() WHERE id = $2`,
            [newNextBilling, sub.id]
          )
          created++
        } catch (err) {
          if (isPgError(err) && err.code === '23505' && err.constraint === 'uq_invoices_subscription_period_start') {
            // Already billed this period (duplicate run)
            skipped++
            await tx.query(`UPDATE subscriptions SET last_billing_attempt_at = now() WHERE id = $1`, [sub.id])
          } else {
            throw err
          }
        }
        
        return true // Continue loop
      })
      
      if (!processed) break
    }
    
    // Update run log
    await pool.query(
      `UPDATE billing_runs SET status = 'completed', finished_at = now(), subscriptions_scanned = $1, invoices_created = $2, invoices_skipped = $3 WHERE id = $4`,
      [scanned, created, skipped, runId]
    )
  } catch (error) {
    await pool.query(
      `UPDATE billing_runs SET status = 'failed', finished_at = now(), subscriptions_scanned = $1, invoices_created = $2, invoices_skipped = $3, errors_count = 1 WHERE id = $4`,
      [scanned, created, skipped, runId]
    )
    throw error
  }
  
  return runId
}
