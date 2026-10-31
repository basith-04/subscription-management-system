import type { Pool } from 'pg'
import { ApiError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { withTransaction } from '../../lib/db.js'
import { todayInAppTimezone } from '../../lib/dates.js'
import { buildMeta } from '../../lib/pagination.js'
import { createBillingRun, runBilling, billOnePeriod } from '../../billing/run-billing.js'
import { periodStart } from '../../billing/calculators/periods.js'
import * as repo from './billing-runs.repository.js'
import type { CreateRunInput, ListRunsQuery, UpcomingQuery, ManualCreateInvoiceInput } from './billing-runs.schemas.js'

export async function startRun(pool: Pool, input: CreateRunInput, actorId: number): Promise<{ run_id: number, status: string }> {
  const asOf = input.as_of ?? todayInAppTimezone()
  if (asOf > todayInAppTimezone()) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'as_of cannot be in the future')
  }

  const running = await repo.findRecentRunningRun(pool)
  if (running) {
    throw new ApiError(409, ERROR_CODES.CONFLICT, `A billing run is already in progress (ID: ${running.id})`)
  }

  const runId = await createBillingRun(pool, 'manual', asOf, actorId)
  
  // Fire and forget (simulate background worker)
  void runBilling(pool, { asOf, runId }).catch(err => console.error(`[billing-run:${runId}] failed`, err))

  return { run_id: runId, status: 'running' }
}

export async function list(pool: Pool, query: ListRunsQuery) {
  const page = query.page ?? 1
  const pageSize = query.page_size ?? 20
  const { rows, total } = await repo.listRuns(pool, pageSize, (page - 1) * pageSize)
  return { data: rows, meta: buildMeta(total, page, pageSize) }
}

export async function get(pool: Pool, id: number) {
  const run = await repo.findRun(pool, id)
  if (!run) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Billing run not found')
  
  const errors = await repo.getFailedSubscriptionsForRun(pool, run.started_at)
  return { ...run, errors }
}

export async function upcoming(pool: Pool, query: UpcomingQuery) {
  const asOf = todayInAppTimezone()
  const days = query.days ?? 7
  return repo.findUpcoming(pool, asOf, days)
}

export async function manualCreateInvoice(pool: Pool, input: ManualCreateInvoiceInput) {
  const asOf = todayInAppTimezone()
  return withTransaction(pool, async (tx) => {
    const subQuery = await tx.query(
      `SELECT period_index, billing_anchor_date, start_date, billing_frequency, status 
       FROM subscriptions WHERE id = $1 FOR UPDATE`, 
      [input.subscription_id]
    )
    if (subQuery.rows.length === 0) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Subscription not found')
    }
    
    const sub = subQuery.rows[0]
    if (sub.status !== 'active') {
      throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Subscription is not active')
    }

    const anchorDate = sub.billing_anchor_date || sub.start_date
    const expectedPeriodStart = periodStart(anchorDate, sub.period_index, sub.billing_frequency)
    
    // Ensure the requested period_start exactly matches the next unbilled period
    if (input.period_start !== expectedPeriodStart) {
      throw new ApiError(
        422, 
        ERROR_CODES.VALIDATION_ERROR, 
        `Invalid period boundary. The next unbilled period starts on ${expectedPeriodStart}.`
      )
    }
    
    try {
      // Reuse the core billing logic to create the invoice
      await billOnePeriod(tx, input.subscription_id, sub.period_index, asOf, null)
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ApiError(409, 'PERIOD_ALREADY_INVOICED', 'An invoice for this period already exists')
      }
      throw err
    }
    
    // Fetch the newly created invoice to return its ID
    const inv = await tx.query(
      'SELECT id FROM invoices WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1', 
      [input.subscription_id]
    )
    return { id: Number(inv.rows[0].id) }
  })
}
