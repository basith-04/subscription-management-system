// SQL queries for invoices tables; private to the module.
// Dates are selected as text (YYYY-MM-DD) so the pg driver never shifts them through the local timezone.
// Money is NUMERIC → string, ids are BIGINT → string (converted in the service).
import type { Queryable } from '../../lib/db.js'
import { paymentStateSql } from './invoices.payment-state.js'
import type { InvoiceSortField, InvoiceStatus, PaymentState } from './invoices.constants.js'

export interface InvoiceRow {
  id: string
  number: string
  subscription_id: string
  customer_id: string
  billing_run_id: string | null
  status: InvoiceStatus
  period_start: string
  period_end: string
  issue_date: string
  due_date: string
  customer_name: string
  customer_email: string
  customer_tax_id: string | null
  billing_address: Record<string, unknown> | null
  payment_term_name: string
  notes: string | null
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  amount_due: string
  confirmed_at: Date | null
  paid_at: Date | null
  cancelled_at: Date | null
  sent_at: Date | null
  cancel_reason: string | null
  created_at: Date
  updated_at: Date
}

export interface InvoiceItemRow {
  id: string
  invoice_id: string
  subscription_item_id: string | null
  product_id: string | null
  description: string
  quantity: number
  unit_price: string
  line_subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_name: string | null
  tax_rate: string
  tax_amount: string
  line_total: string
}

export interface InvoiceTaxDetailRow {
  tax_name: string
  tax_rate: string
  taxable_amount: string
  tax_amount: string
}

export interface ListFilters {
  status?: InvoiceStatus
  payment_state?: readonly PaymentState[]
  customer_id?: number
  subscription_id?: number
  issue_from?: string
  issue_to?: string
  due_from?: string
  due_to?: string
  q?: string
  min_total?: string
  max_total?: string
}

export interface ListSummary {
  count: number
  total: string
  amount_paid: string
  amount_due: string
}

export interface ListRow {
  id: string
  number: string
  customer_id: string
  customer_name: string
  subscription_id: string
  status: InvoiceStatus
  payment_state: PaymentState
  issue_date: string
  due_date: string
  total: string
  amount_paid: string
  amount_due: string
  sent_at: Date | null
}

const DETAIL_COLUMNS = `i.id, i.number, i.subscription_id, i.customer_id, i.billing_run_id, i.status,
  i.period_start::text, i.period_end::text, i.issue_date::text, i.due_date::text,
  i.customer_name, i.customer_email, i.customer_tax_id, i.billing_address, i.payment_term_name, i.notes,
  i.subtotal, i.discount_total, i.tax_total, i.total, i.amount_paid, i.amount_due,
  i.confirmed_at, i.paid_at, i.cancelled_at, i.sent_at, i.cancel_reason, i.created_at, i.updated_at`

/** Escape LIKE wildcards so user input is matched literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * One WHERE builder shared by the list and the summary aggregate, so `meta.summary` always
 * describes exactly the filtered set. `today` / `grace` are bound parameters.
 */
function buildWhere(filters: ListFilters, today: string, grace: number) {
  const params: unknown[] = []
  const clauses: string[] = []
  // today/grace are bound only when something references them (Postgres rejects unused bind parameters).
  let stateParams: { today: string; grace: string } | undefined
  const state = () => {
    if (!stateParams) {
      params.push(today, grace)
      stateParams = { today: `$${params.length - 1}`, grace: `$${params.length}` }
    }
    return stateParams
  }
  const add = (sql: string, value: unknown) => {
    params.push(value)
    clauses.push(sql.replace('?', `$${params.length}`))
  }
  if (filters.status) add('i.status = ?', filters.status)
  if (filters.payment_state?.length) {
    const { today: t, grace: g } = state()
    add(`${paymentStateSql('i', t, g)} = ANY(?::text[])`, [...filters.payment_state])
  }
  if (filters.customer_id) add('i.customer_id = ?', filters.customer_id)
  if (filters.subscription_id) add('i.subscription_id = ?', filters.subscription_id)
  if (filters.issue_from) add('i.issue_date >= ?::date', filters.issue_from)
  if (filters.issue_to) add('i.issue_date <= ?::date', filters.issue_to)
  if (filters.due_from) add('i.due_date >= ?::date', filters.due_from)
  if (filters.due_to) add('i.due_date <= ?::date', filters.due_to)
  if (filters.min_total) add('i.total >= ?::numeric', filters.min_total)
  if (filters.max_total) add('i.total <= ?::numeric', filters.max_total)
  if (filters.q) {
    params.push(likePattern(filters.q))
    const p = `$${params.length}`
    clauses.push(`(i.number ILIKE ${p} OR i.customer_name ILIKE ${p} OR i.customer_email ILIKE ${p})`)
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params, state }
}

const SORT_COLUMN: Record<InvoiceSortField, string> = {
  issue_date: 'i.issue_date', due_date: 'i.due_date', total: 'i.total', number: 'i.number',
}

function orderBy(sort: string | undefined): string {
  const parts = (sort ?? '-issue_date').split(',').map((f) => {
    const desc = f.startsWith('-')
    const col = SORT_COLUMN[f.replace(/^-/, '') as InvoiceSortField]
    return `${col} ${desc ? 'DESC' : 'ASC'}`
  })
  return `ORDER BY ${parts.join(', ')}, i.id DESC`
}

export async function listInvoices(
  db: Queryable,
  filters: ListFilters,
  opts: { sort?: string; limit: number; offset: number; today: string; grace: number },
): Promise<{ rows: ListRow[]; summary: ListSummary }> {
  const { where, params, state } = buildWhere(filters, opts.today, opts.grace)

  // Summary: ONE aggregate over the same filter. Totals cover issued invoices only
  // (confirmed + paid); drafts and cancelled are excluded from revenue/outstanding (state-machines §3.4).
  const summaryResult = await db.query<{ count: string; total: string; amount_paid: string; amount_due: string }>(
    `SELECT count(*)::text AS count,
            COALESCE(sum(i.total) FILTER (WHERE i.status IN ('confirmed','paid')), 0)::text AS total,
            COALESCE(sum(i.amount_paid) FILTER (WHERE i.status IN ('confirmed','paid')), 0)::text AS amount_paid,
            COALESCE(sum(i.amount_due) FILTER (WHERE i.status = 'confirmed'), 0)::text AS amount_due
       FROM invoices i ${where}`,
    params,
  )
  const s = summaryResult.rows[0]!

  const st = state() // the summary above has already run, so binding today/grace now is safe
  const listParams = [...params, opts.limit, opts.offset]
  const rows = await db.query<ListRow>(
    `SELECT i.id, i.number, i.customer_id, i.customer_name, i.subscription_id, i.status,
            ${paymentStateSql('i', st.today, st.grace)} AS payment_state,
            i.issue_date::text, i.due_date::text, i.total, i.amount_paid, i.amount_due, i.sent_at
       FROM invoices i ${where}
       ${orderBy(opts.sort)}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  )
  return {
    rows: rows.rows,
    summary: { count: Number(s.count), total: money(s.total), amount_paid: money(s.amount_paid), amount_due: money(s.amount_due) },
  }
}

/** SUM(numeric)::text may carry no decimals when empty ("0"); normalise to 2 decimals. */
const money = (v: string) => (v.includes('.') ? v : `${v}.00`)

export async function findInvoice(db: Queryable, id: number, opts: { forUpdate?: boolean } = {}): Promise<InvoiceRow | null> {
  const r = await db.query<InvoiceRow>(
    `SELECT ${DETAIL_COLUMNS} FROM invoices i WHERE i.id = $1 ${opts.forUpdate ? 'FOR UPDATE' : ''}`,
    [id],
  )
  return r.rows[0] ?? null
}

export async function listItems(db: Queryable, invoiceId: number): Promise<InvoiceItemRow[]> {
  const r = await db.query<InvoiceItemRow>(
    `SELECT id, invoice_id, subscription_item_id, product_id, description, quantity, unit_price, line_subtotal,
            discount_amount, taxable_amount, tax_name, tax_rate, tax_amount, line_total
       FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
    [invoiceId],
  )
  return r.rows
}

export async function listTaxDetails(db: Queryable, invoiceId: number): Promise<InvoiceTaxDetailRow[]> {
  const r = await db.query<InvoiceTaxDetailRow>(
    `SELECT tax_name, tax_rate, taxable_amount, tax_amount FROM invoice_tax_details WHERE invoice_id = $1 ORDER BY tax_rate, tax_name`,
    [invoiceId],
  )
  return r.rows
}

/** F09 owns `subscriptions`; it may not be migrated yet, so the lookup tolerates its absence. */
export async function subscriptionNumber(db: Queryable, subscriptionId: number): Promise<string | null> {
  const exists = await db.query<{ present: boolean }>(`SELECT to_regclass('subscriptions') IS NOT NULL AS present`)
  if (!exists.rows[0]?.present) return null
  const r = await db.query<{ number: string }>('SELECT number FROM subscriptions WHERE id = $1', [subscriptionId])
  return r.rows[0]?.number ?? null
}

export async function billingRunExists(db: Queryable, runId: number): Promise<boolean> {
  const r = await db.query('SELECT 1 FROM billing_runs WHERE id = $1', [runId])
  return (r.rowCount ?? 0) > 0
}

export async function draftIdsForRun(db: Queryable, runId: number): Promise<number[]> {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM invoices WHERE billing_run_id = $1 AND status = 'draft' ORDER BY id`,
    [runId],
  )
  return r.rows.map((x) => Number(x.id))
}

// ── conditional status updates (UPDATE … WHERE id AND status = expected; check the row count) ──

export async function confirmDraft(tx: Queryable, id: number): Promise<boolean> {
  const r = await tx.query(
    `UPDATE invoices SET status = 'confirmed', confirmed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'draft'`,
    [id],
  )
  return (r.rowCount ?? 0) === 1
}

/** draft, or confirmed with no payment allocated. */
export async function cancelIfAllowed(tx: Queryable, id: number, reason: string): Promise<boolean> {
  const r = await tx.query(
    `UPDATE invoices SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
      WHERE id = $1 AND (status = 'draft' OR (status = 'confirmed' AND amount_paid = 0))`,
    [id, reason],
  )
  return (r.rowCount ?? 0) === 1
}

/** sent_at is only a delivery stamp, so it may be refreshed on re-send; never for draft/cancelled. */
export async function markSent(tx: Queryable, id: number): Promise<Date | null> {
  const r = await tx.query<{ sent_at: Date }>(
    `UPDATE invoices SET sent_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('confirmed','paid') RETURNING sent_at`,
    [id],
  )
  return r.rows[0]?.sent_at ?? null
}

// ── draft editing ──

export async function updateDraftFields(
  tx: Queryable,
  id: number,
  fields: { due_date?: string; notes?: string | null },
): Promise<boolean> {
  const sets: string[] = []
  const params: unknown[] = [id]
  if (fields.due_date !== undefined) { params.push(fields.due_date); sets.push(`due_date = $${params.length}::date`) }
  if (fields.notes !== undefined) { params.push(fields.notes); sets.push(`notes = $${params.length}`) }
  if (!sets.length) return true
  const r = await tx.query(
    `UPDATE invoices SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND status = 'draft'`,
    params,
  )
  return (r.rowCount ?? 0) === 1
}

export async function deleteDraftItems(tx: Queryable, invoiceId: number, itemIds: number[]): Promise<number[]> {
  const r = await tx.query<{ id: string }>(
    `DELETE FROM invoice_items WHERE invoice_id = $1 AND id = ANY($2::bigint[]) RETURNING id`,
    [invoiceId, itemIds],
  )
  return r.rows.map((x) => Number(x.id))
}

/** Recompute header totals and the tax summary from the remaining lines. Draft only. */
export async function recomputeDraftTotals(tx: Queryable, invoiceId: number): Promise<boolean> {
  const r = await tx.query(
    `UPDATE invoices i SET
        subtotal = t.subtotal, discount_total = t.discount, tax_total = t.tax,
        total = t.subtotal - t.discount + t.tax, updated_at = now()
       FROM (SELECT COALESCE(sum(line_subtotal), 0) AS subtotal,
                    COALESCE(sum(discount_amount), 0) AS discount,
                    COALESCE(sum(tax_amount), 0) AS tax
               FROM invoice_items WHERE invoice_id = $1) t
      WHERE i.id = $1 AND i.status = 'draft'`,
    [invoiceId],
  )
  if ((r.rowCount ?? 0) !== 1) return false
  await tx.query('DELETE FROM invoice_tax_details WHERE invoice_id = $1', [invoiceId])
  await tx.query(
    `INSERT INTO invoice_tax_details (invoice_id, tax_name, tax_rate, taxable_amount, tax_amount)
     SELECT invoice_id, COALESCE(tax_name, 'Tax'), tax_rate, sum(taxable_amount), sum(tax_amount)
       FROM invoice_items WHERE invoice_id = $1 AND (tax_name IS NOT NULL OR tax_rate > 0)
      GROUP BY invoice_id, COALESCE(tax_name, 'Tax'), tax_rate`,
    [invoiceId],
  )
  return true
}

/** Confirm-time consistency: at least one line, and header totals equal the sum of the lines. */
export async function checkConsistency(db: Queryable, invoiceId: number): Promise<{ lines: number; consistent: boolean }> {
  const r = await db.query<{ lines: string; consistent: boolean }>(
    `SELECT (SELECT count(*) FROM invoice_items WHERE invoice_id = i.id)::text AS lines,
            (i.subtotal = COALESCE((SELECT sum(line_subtotal) FROM invoice_items WHERE invoice_id = i.id), 0)
             AND i.discount_total = COALESCE((SELECT sum(discount_amount) FROM invoice_items WHERE invoice_id = i.id), 0)
             AND i.tax_total = COALESCE((SELECT sum(tax_amount) FROM invoice_items WHERE invoice_id = i.id), 0)
             AND i.total = i.subtotal - i.discount_total + i.tax_total) AS consistent
       FROM invoices i WHERE i.id = $1`,
    [invoiceId],
  )
  const row = r.rows[0]
  return { lines: Number(row?.lines ?? 0), consistent: row?.consistent ?? false }
}
