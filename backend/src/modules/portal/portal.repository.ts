// SQL for the customer portal. EVERY function takes `customerId` (from the session via scopeToCustomer) and puts it in
// the WHERE clause, so there is no unscoped way to read a customer's data from this module. Dates are text (YYYY-MM-DD).
import type { Queryable } from '../../lib/db.js'
import { paymentStateSql } from '../invoices/index.js'
import { VISIBLE_INVOICE_STATUSES, VISIBLE_SUBSCRIPTION_STATUSES } from './portal.constants.js'

export interface SubscriptionRow {
  id: string; number: string; status: string
  start_date: string; expiry_date: string; quotation_valid_until: string | null; next_billing_date: string | null
  paused_at: Date | null; auto_renew: boolean
  plan_id: string; plan_name: string; billing_frequency: string; plan_is_active: boolean
  allow_pause: boolean; allow_renewal: boolean; allow_early_close: boolean
  payment_term_name: string
}
export interface ItemRow {
  id: string; description: string; quantity: number; unit_price: string; line_amount: string
  tax_name: string | null; tax_rate: string | null
}
export interface InvoiceListRow {
  id: string; number: string; status: string; payment_state: string; issue_date: string; due_date: string
  total: string; amount_paid: string; amount_due: string
}
export interface PaymentRow { id: string; method: string; payment_date: string; amount: string; reference_number: string | null; is_voided: boolean }

const SUB_COLUMNS = `s.id, s.number, s.status, s.start_date::text, s.expiry_date::text, s.quotation_valid_until::text,
  s.next_billing_date::text, s.paused_at, s.auto_renew, p.id AS plan_id, p.name AS plan_name, p.billing_frequency,
  p.is_active AS plan_is_active, p.allow_pause, p.allow_renewal, p.allow_early_close, pt.name AS payment_term_name`
const SUB_FROM = 'FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN payment_terms pt ON pt.id = s.payment_term_id'
const SUB_SORT: Record<string, string> = { number: 's.number', start_date: 's.start_date', expiry_date: 's.expiry_date', next_billing_date: 's.next_billing_date', created_at: 's.id' }

export async function listSubscriptions(db: Queryable, customerId: number, f: { status?: string; sort?: string; limit: number; offset: number }) {
  const statuses = f.status ? [f.status] : [...VISIBLE_SUBSCRIPTION_STATUSES]
  const order = (f.sort ?? '-created_at').split(',').map((x) => `${SUB_SORT[x.replace(/^-/, '')]} ${x.startsWith('-') ? 'DESC' : 'ASC'} NULLS LAST`).join(', ')
  const where = 'WHERE s.customer_id = $1 AND s.status = ANY($2::text[])'
  const total = await db.query<{ n: string }>(`SELECT count(*)::text AS n ${SUB_FROM} ${where}`, [customerId, statuses])
  const rows = await db.query<SubscriptionRow>(
    `SELECT ${SUB_COLUMNS} ${SUB_FROM} ${where} ORDER BY ${order}, s.id DESC LIMIT $3 OFFSET $4`, [customerId, statuses, f.limit, f.offset])
  return { rows: rows.rows, total: Number(total.rows[0]!.n) }
}

/** `WHERE id = $1 AND customer_id = $2` — null for another customer's record (and for drafts). */
export async function findSubscription(db: Queryable, customerId: number, id: number): Promise<SubscriptionRow | null> {
  const r = await db.query<SubscriptionRow>(
    `SELECT ${SUB_COLUMNS} ${SUB_FROM} WHERE s.id = $1 AND s.customer_id = $2 AND s.status = ANY($3::text[])`,
    [id, customerId, [...VISIBLE_SUBSCRIPTION_STATUSES]])
  return r.rows[0] ?? null
}

export async function listSubscriptionItems(db: Queryable, customerId: number, subscriptionId: number): Promise<ItemRow[]> {
  const r = await db.query<ItemRow>(
    `SELECT i.id, i.description, i.quantity, i.unit_price, i.line_amount, t.name AS tax_name, t.rate::text AS tax_rate
       FROM subscription_items i
       JOIN subscriptions s ON s.id = i.subscription_id
       LEFT JOIN tax_rules t ON t.id = i.tax_rule_id
      WHERE i.subscription_id = $1 AND s.customer_id = $2 ORDER BY i.sort_order, i.id`, [subscriptionId, customerId])
  return r.rows
}

const INV_SORT: Record<string, string> = { issue_date: 'i.issue_date', due_date: 'i.due_date', total: 'i.total', number: 'i.number' }

export async function listInvoices(db: Queryable, customerId: number, f: {
  status?: string; payment_state?: string[]; sort?: string; limit: number; offset: number; today: string; grace: number
}) {
  const statuses = f.status ? [f.status] : [...VISIBLE_INVOICE_STATUSES]
  const params: unknown[] = [customerId, statuses, f.today, f.grace]
  const state = paymentStateSql('i', '$3', '$4')
  let where = 'WHERE i.customer_id = $1 AND i.status = ANY($2::text[])'
  if (f.payment_state?.length) { params.push(f.payment_state); where += ` AND ${state} = ANY($${params.length}::text[])` }
  const order = (f.sort ?? '-issue_date').split(',').map((x) => `${INV_SORT[x.replace(/^-/, '')]} ${x.startsWith('-') ? 'DESC' : 'ASC'}`).join(', ')
  // Postgres rejects unused bind parameters, so the count only binds today/grace when the state filter references them.
  const countParams = f.payment_state?.length ? params : [customerId, statuses]
  const total = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM invoices i ${where}`, countParams)
  const rows = await db.query<InvoiceListRow>(
    `SELECT i.id, i.number, i.status, ${state} AS payment_state, i.issue_date::text, i.due_date::text, i.total, i.amount_paid, i.amount_due
       FROM invoices i ${where} ORDER BY ${order}, i.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.limit, f.offset])
  return { rows: rows.rows, total: Number(total.rows[0]!.n) }
}

/** Is this a non-draft invoice of this customer? The only gate to the shared F11 detail loader. */
export async function ownsVisibleInvoice(db: Queryable, customerId: number, id: number): Promise<boolean> {
  const r = await db.query('SELECT 1 FROM invoices WHERE id = $1 AND customer_id = $2 AND status = ANY($3::text[])', [id, customerId, [...VISIBLE_INVOICE_STATUSES]])
  return (r.rowCount ?? 0) > 0
}

/** Payment history for one of the customer's invoices (D-17). Voided payments are returned flagged, never counted. */
export async function listInvoicePayments(db: Queryable, customerId: number, invoiceId: number): Promise<PaymentRow[]> {
  const present = await db.query<{ p: boolean }>(`SELECT to_regclass('payments') IS NOT NULL AS p`)
  if (!present.rows[0]!.p) return []
  const r = await db.query<PaymentRow>(
    `SELECT p.id, p.method, p.payment_date::text, a.amount, p.reference_number, (p.voided_at IS NOT NULL) AS is_voided
       FROM payment_allocations a
       JOIN payments p ON p.id = a.payment_id
       JOIN invoices i ON i.id = a.invoice_id
      WHERE a.invoice_id = $1 AND i.customer_id = $2 AND p.customer_id = $2
      ORDER BY p.payment_date DESC, p.id DESC`, [invoiceId, customerId])
  return r.rows
}
