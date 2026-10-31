import { getSharedPool } from '../lib/db.js'
import { todayInAppTimezone } from '../lib/dates.js'
import { runBilling } from './run-billing.js'

/**
 * Scheduled entry point.
 * It uses the shared DB pool and defaults to today's date in the business timezone.
 */
export async function runBillingJob(): Promise<void> {
  const pool = getSharedPool()
  const asOf = todayInAppTimezone()
  
  try {
    const runId = await runBilling(pool, { asOf, trigger: 'scheduler' })
    console.log(`[billing] run ${runId} completed successfully for ${asOf}`)
  } catch (error) {
    console.error(`[billing] run failed for ${asOf}`, error)
    throw error
  }
}
