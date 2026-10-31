// payment_state — the ONE implementation (SQL expression + JS helper). Derived, never stored.
// Other modules (F13, F14, F16) must import from here instead of re-deriving.
//
// Rules (docs/architecture/state-machines.md §3.4, D-13 grace days, D-22 business timezone):
//   draft / cancelled / paid  → themselves (paid also when a confirmed invoice has nothing left to pay)
//   confirmed, amount_due > 0:
//     today > due_date + grace  → overdue          (wins over partially_paid: still collectible, still late)
//     amount_paid > 0           → partially_paid
//     today < due_date          → not_due
//     otherwise                 → outstanding      (due now / inside the grace window, nothing paid)
import { compare } from '../../lib/money.js'
import { DEFAULT_APP_TIMEZONE, OVERDUE_GRACE_DAYS, type InvoiceStatus, type PaymentState } from './invoices.constants.js'

export interface PaymentStateInput {
  status: InvoiceStatus
  /** Money strings, e.g. "3000.00". */
  amount_paid: string
  amount_due: string
  /** Calendar date, YYYY-MM-DD. */
  due_date: string
}

/** Calendar date + whole days, in UTC arithmetic (dates carry no time zone). */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** JS derivation. `today` is a YYYY-MM-DD business date (see todayInBusinessTimezone). */
export function derivePaymentState(
  invoice: PaymentStateInput,
  today: string,
  graceDays: number = OVERDUE_GRACE_DAYS,
): PaymentState {
  if (invoice.status === 'draft') return 'draft'
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.status === 'paid' || compare(invoice.amount_due, '0.00') <= 0) return 'paid'
  // YYYY-MM-DD strings sort chronologically.
  if (today > addDays(invoice.due_date, graceDays)) return 'overdue'
  if (compare(invoice.amount_paid, '0.00') > 0) return 'partially_paid'
  if (today < invoice.due_date) return 'not_due'
  return 'outstanding'
}

/**
 * SQL derivation, identical semantics to derivePaymentState. `todayParam` / `graceParam` are
 * positional placeholders (e.g. "$3") bound by the caller; values never get interpolated.
 */
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

/** Business "today" (D-22): the calendar date of `now` in APP_TIMEZONE. */
export function todayInBusinessTimezone(
  now: Date = new Date(),
  timeZone: string = process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`
}
