import { registerJob } from '../lib/scheduler.js'
import { runBillingJob } from '../billing/billing.jobs.js'

export function registerAllJobs(): void {
  // Run daily at 00:30 APP_TIMEZONE (default Asia/Kolkata)
  registerJob('billing', '30 0 * * *', runBillingJob)
}
