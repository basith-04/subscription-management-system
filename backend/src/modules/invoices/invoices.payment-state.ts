// payment_state — the ONE implementation (SQL expression + JS helper). Derived, never stored.
import { compare } from '../../lib/money.js'
import { todayInAppTimezone } from '../../lib/dates.js'
import { OVERDUE_GRACE_DAYS, type InvoiceStatus, type PaymentState } from './invoices.constants.js'

export interface PaymentStateInput {
  status: InvoiceStatus
  amount_paid: string
  amount_due: string
  due_date: string
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function derivePaymentState(
  invoice: PaymentStateInput,
  today: string,
  graceDays: number = OVERDUE_GRACE_DAYS,
): PaymentState {
  if (invoice.status === 'draft') return 'draft'
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.status === 'paid' || compare(invoice.amount_due, '0.00') <= 0) return 'paid'
  if (today > addDays(invoice.due_date, graceDays)) return 'overdue'
  if (compare(invoice.amount_paid, '0.00') > 0) return 'partially_paid'
  if (today < invoice.due_date) return 'not_due'
  return 'outstanding'
}

export function paymentStateSql(alias: string, todayParam: string, graceParam: string): string {
  const a = alias
  return `(CASE
    WHEN ${a}.status = 'draft' THEN 'draft'
    WHEN ${a}.status = 'cancelled' THEN 'cancelled'
    WHEN ${a}.status = 'paid' OR ${a}.amount_due <= 0 THEN 'paid'
    WHEN ${todayParam}::date > ${a}.due_date + ${graceParam}::int THEN 'overdue'
    WHEN ${a}.amount_paid > 0 THEN 'partially_paid'
    WHEN ${todayParam}::date < ${a}.due_date THEN 'not_due'
    ELSE 'outstanding'
  END)`
}

// Re-export from the central F00 lib for backwards compatibility with F11 tests.
export { todayInAppTimezone as todayInBusinessTimezone } from '../../lib/dates.js'
