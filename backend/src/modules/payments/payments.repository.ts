// SQL queries for payments tables; private to the module. Dates are selected as text (YYYY-MM-DD).
import type { Queryable } from '../../lib/db.js'
import { paymentStateSql } from '../invoices/invoices.payment-state.js'
import type { PaymentMethod } from './payments.constants.js'

export interface PaymentRow {
  id: string
  customer_id: string
  customer_name: string
  method: PaymentMethod
  amount: string
  payment_date: string
  note: string | null
  reference_number: string | null
  source: string
  voided_at: Date | null
  void_reason: string | null
  recorded_by: string | null
  created_at: Date
}
export interface AllocationRow { payment_id: string; invoice_id: string; invoice_number: string; amount: string }

const COLS = `p.id, p.customer_id, c.name AS customer_name, p.method, p.amount, p.payment_date::text AS payment_date, p.note,
  p.reference_number, p.source, p.voided_at, p.void_reason, p.recorded_by, p.created_at`
const FROM = 'FROM payments p JOIN customers c ON c.id = p.customer_id'

export interface PaymentFilters {
  method?: string; customer_id?: number; invoice_id?: number; date_from?: string; date_to?: string; voided?: boolean; q?: string
}

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`

function where(f: PaymentFilters) {
  const params: unknown[] = []
  const clauses: string[] = []
  const add = (sql: string, v: unknown) => { params.push(v); clauses.push(sql.replace('?', `$${params.length}`)) }
  if (f.method) add('p.method = ?', f.method)
  if (f.customer_id) add('p.customer_id = ?', f.customer_id)
  if (f.invoice_id) add('EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = ?)', f.invoice_id)
  if (f.date_from) add('p.payment_date >= ?::date', f.date_from)
  if (f.date_to) add('p.payment_date <= ?::date', f.date_to)
  if (f.voided !== undefined) clauses.push(f.voided ? 'p.voided_at IS NOT NULL' : 'p.voided_at IS NULL')
  if (f.q) {
    params.push(likePattern(f.q))
    const n = `$${params.length}`
    clauses.push(`(p.reference_number ILIKE ${n} OR c.name ILIKE ${n} OR c.email::text ILIKE ${n})`)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function orderBy(sort?: string) {
  const cols: Record<string, string> = { payment_date: 'p.payment_date', amount: 'p.amount' }
  const parts = (sort ?? '-payment_date').split(',').map((f) => `${cols[f.replace(/^-/, '')]} ${f.startsWith('-') ? 'DESC' : 'ASC'}`)
  return `ORDER BY ${parts.join(', ')}, p.id DESC`
}

export async function listPayments(db: Queryable, f: PaymentFilters, o: { sort?: string; limit: number; offset: number }) {
  const w = where(f)
  const total = await db.query<{ n: string }>(`SELECT count(*)::text AS n ${FROM} ${w.sql}`, w.params)
  const rows = await db.query<PaymentRow>(
    `SELECT ${COLS} ${FROM} ${w.sql} ${orderBy(o.sort)} LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`,
    [...w.params, o.limit, o.offset])
  return { rows: rows.rows, total: Number(total.rows[0]!.n) }
}

export async function findPayment(db: Queryable, id: number, opts: { forUpdate?: boolean } = {}): Promise<PaymentRow | null> {
  // FOR UPDATE cannot lock the joined customers row's nullable side; lock only the payment.
  const r = await db.query<PaymentRow>(`SELECT ${COLS} ${FROM} WHERE p.id = $1 ${opts.forUpdate ? 'FOR UPDATE OF p' : ''}`, [id])
  return r.rows[0] ?? null
}

export async function allocationsFor(db: Queryable, paymentIds: number[]): Promise<AllocationRow[]> {
  if (!paymentIds.length) return []
  const r = await db.query<AllocationRow>(
    `SELECT a.payment_id, a.invoice_id, i.number AS invoice_number, a.amount
       FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id
      WHERE a.payment_id = ANY($1::bigint[]) ORDER BY a.id`, [paymentIds])
  return r.rows
}

export async function listForInvoice(db: Queryable, invoiceId: number): Promise<PaymentRow[]> {
  const r = await db.query<PaymentRow>(
    `SELECT ${COLS} ${FROM}
      WHERE EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = $1)
      ORDER BY p.payment_date DESC, p.id DESC`, [invoiceId])
  return r.rows
}

export async function invoiceExists(db: Queryable, id: number): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM invoices WHERE id = $1', [id])).rowCount ?? 0) > 0
}

export async function customerExists(db: Queryable, id: number): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM customers WHERE id = $1', [id])).rowCount ?? 0) > 0
}

export async function insertPayment(tx: Queryable, p: {
  customer_id: number; method: string; amount: string; payment_date: string; note: string | null
  reference_number: string | null; recorded_by: number
}): Promise<number> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO payments (customer_id, method, amount, payment_date, note, reference_number, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [p.customer_id, p.method, p.amount, p.payment_date, p.note, p.reference_number, p.recorded_by])
  return Number(r.rows[0]!.id)
}

export async function insertAllocation(tx: Queryable, paymentId: number, invoiceId: number, amount: string): Promise<void> {
  await tx.query('INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)', [paymentId, invoiceId, amount])
}

/** Heuristic: an identical, non-voided payment for the same customer/invoice(s) was created moments ago. */
export async function findRecentDuplicate(tx: Queryable, p: {
  customer_id: number; method: string; amount: string; payment_date: string; invoice_ids: number[]; windowSeconds: number
}): Promise<number | null> {
  const r = await tx.query<{ id: string }>(
    `SELECT p.id FROM payments p
      WHERE p.customer_id = $1 AND p.method = $2 AND p.amount = $3 AND p.payment_date = $4::date
        AND p.voided_at IS NULL AND p.created_at > now() - make_interval(secs => $6)
        AND EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = ANY($5::bigint[]))
      LIMIT 1`,
    [p.customer_id, p.method, p.amount, p.payment_date, p.invoice_ids, p.windowSeconds])
  return r.rows[0] ? Number(r.rows[0].id) : null
}

export async function markVoided(tx: Queryable, id: number, reason: string): Promise<boolean> {
  const r = await tx.query('UPDATE payments SET voided_at = now(), void_reason = $2 WHERE id = $1 AND voided_at IS NULL', [id, reason])
  return (r.rowCount ?? 0) === 1
}

export async function invoiceIdsOfPayment(tx: Queryable, paymentId: number): Promise<number[]> {
  const r = await tx.query<{ invoice_id: string }>('SELECT invoice_id FROM payment_allocations WHERE payment_id = $1 ORDER BY invoice_id', [paymentId])
  return r.rows.map((x) => Number(x.invoice_id))
}

/** Reconciliation: invoices whose amount_paid differs from the sum of active allocations (should be empty). */
export async function reconciliationMismatches(db: Queryable): Promise<Array<{ id: string; amount_paid: string; allocated: string }>> {
  const r = await db.query<{ id: string; amount_paid: string; allocated: string }>(
    `SELECT i.id, i.amount_paid, COALESCE(s.total, 0)::numeric(12,2)::text AS allocated
       FROM invoices i
       LEFT JOIN (SELECT a.invoice_id, sum(a.amount) AS total FROM payment_allocations a
                   JOIN payments p ON p.id = a.payment_id WHERE p.voided_at IS NULL GROUP BY a.invoice_id) s ON s.invoice_id = i.id
      WHERE i.amount_paid <> COALESCE(s.total, 0)`)
  return r.rows
}

/** Outstanding / overdue totals using the single payment_state definition owned by F11. */
export async function balanceTotals(db: Queryable, filter: { customerId?: number }, today: string, grace: number) {
  const params: unknown[] = [today, grace]
  let where = "i.status = 'confirmed' AND i.amount_due > 0"
  if (filter.customerId) { params.push(filter.customerId); where += ` AND i.customer_id = $${params.length}` }
  const state = paymentStateSql('i', '$1', '$2')
  const r = await db.query<{ outstanding: string; overdue: string; overdue_count: string; outstanding_count: string }>(
    `SELECT COALESCE(sum(i.amount_due), 0)::numeric(14,2)::text AS outstanding,
            COALESCE(sum(i.amount_due) FILTER (WHERE ${state} = 'overdue'), 0)::numeric(14,2)::text AS overdue,
            count(*)::text AS outstanding_count,
            count(*) FILTER (WHERE ${state} = 'overdue')::text AS overdue_count
       FROM invoices i WHERE ${where}`, params)
  const x = r.rows[0]!
  return { outstanding_amount: x.outstanding, overdue_amount: x.overdue, outstanding_count: Number(x.outstanding_count), overdue_count: Number(x.overdue_count) }
}

export async function invoicesTableExists(db: Queryable): Promise<boolean> {
  return (await db.query<{ p: boolean }>(`SELECT to_regclass('invoices') IS NOT NULL AS p`)).rows[0]!.p
}
