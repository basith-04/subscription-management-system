// Test-only factories for F11. In production invoices are created by the F12 billing engine and
// subscriptions by F09; until those land, tests build consistent rows directly.
// Totals are computed exactly like docs/database/database-design.md §6 (per-line, ROUND_HALF_UP).
import type { Pool } from 'pg'
import { add, fromMinor, mulInt, sub, toMinor } from '../../src/lib/money.js'

export interface LineSpec {
  description?: string
  quantity?: number
  unit_price?: string
  discount?: string
  tax_name?: string | null
  tax_rate?: string
}

export interface CreateInvoiceOptions {
  customerId: number
  subscriptionId: number
  status?: 'draft' | 'confirmed' | 'paid' | 'cancelled'
  lines?: LineSpec[]
  /** Part payment on a confirmed invoice (what F13 will maintain). */
  amountPaid?: string
  periodStart?: string
  periodEnd?: string
  issueDate?: string
  dueDate?: string
  customerName?: string
  customerEmail?: string
  customerTaxId?: string | null
  billingAddress?: Record<string, unknown> | null
  notes?: string | null
  billingRunId?: number | null
  number?: string
}

let periodCounter = 0

export async function createSubscriptionStandIn(pool: Pool, customerId: number, number?: string): Promise<{ id: number; number: string }> {
  const n = number ?? `SUB-${String(Date.now() % 1_000_000).padStart(6, '0')}-${++periodCounter}`
  const r = await pool.query<{ id: string }>(
    'INSERT INTO subscriptions (number, customer_id) VALUES ($1, $2) RETURNING id',
    [n, customerId],
  )
  return { id: Number(r.rows[0]!.id), number: n }
}

/** ROUND_HALF_UP(taxable × rate / 100, 2) in exact integer arithmetic. */
function taxFor(taxable: string, rate: string): string {
  const rateMilli = BigInt(Math.round(Number(rate) * 1000))
  return fromMinor((toMinor(taxable) * rateMilli + 50_000n) / 100_000n)
}

export async function createBillingRun(pool: Pool): Promise<number> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO billing_runs (trigger, run_date, status) VALUES ('manual', CURRENT_DATE, 'completed') RETURNING id`,
  )
  return Number(r.rows[0]!.id)
}

export async function createInvoice(pool: Pool, o: CreateInvoiceOptions): Promise<number> {
  const status = o.status ?? 'draft'
  const specs = o.lines ?? [{}]
  const lines = specs.map((l, i) => {
    const quantity = l.quantity ?? 2
    const unit = l.unit_price ?? '100.00'
    const subtotal = mulInt(unit, quantity)
    const discount = l.discount ?? '0.00'
    const taxable = sub(subtotal, discount)
    const rate = l.tax_rate ?? (l.tax_name === null ? '0.000' : '18.000')
    const taxName = l.tax_name === undefined ? (Number(rate) > 0 ? `GST ${Number(rate)}%` : null) : l.tax_name
    const tax = taxFor(taxable, rate)
    return {
      description: l.description ?? `Line ${i + 1}`, quantity, unit, subtotal, discount, taxable, rate, taxName, tax,
      total: add(taxable, tax),
    }
  })
  const sum = (pick: (l: (typeof lines)[number]) => string) => lines.reduce((acc, l) => add(acc, pick(l)), '0.00')
  const subtotal = sum((l) => l.subtotal)
  const discountTotal = sum((l) => l.discount)
  const taxTotal = sum((l) => l.tax)
  const total = add(sub(subtotal, discountTotal), taxTotal)
  const paid = status === 'paid' ? total : (o.amountPaid ?? '0.00')

  // Distinct period per call so the (subscription_id, period_start) unique index never trips by accident.
  const base = new Date(Date.UTC(2024, 0, 1))
  base.setUTCDate(base.getUTCDate() + periodCounter++)
  const periodStart = o.periodStart ?? base.toISOString().slice(0, 10)
  const periodEnd = o.periodEnd ?? periodStart
  const issueDate = o.issueDate ?? periodStart
  const dueDate = o.dueDate ?? issueDate

  const cust = await pool.query<{ name: string; email: string }>('SELECT name, email FROM customers WHERE id = $1', [o.customerId])
  const c = cust.rows[0]!

  const inv = await pool.query<{ id: string }>(
    `INSERT INTO invoices (number, subscription_id, customer_id, billing_run_id, status, period_start, period_end,
        issue_date, due_date, customer_name, customer_email, customer_tax_id, billing_address, payment_term_name, notes,
        subtotal, discount_total, tax_total, total, amount_paid, confirmed_at, paid_at, cancelled_at, cancel_reason)
     VALUES (COALESCE($1, 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')), $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, 'Net 15', $14,
        $15, $16, $17, $18, $19,
        CASE WHEN $5 IN ('confirmed','paid') THEN now() END,
        CASE WHEN $5 = 'paid' THEN now() END,
        CASE WHEN $5 = 'cancelled' THEN now() END,
        CASE WHEN $5 = 'cancelled' THEN 'test cancel' END)
     RETURNING id`,
    [
      o.number ?? null, o.subscriptionId, o.customerId, o.billingRunId ?? null, status, periodStart, periodEnd,
      issueDate, dueDate, o.customerName ?? c.name, o.customerEmail ?? c.email, o.customerTaxId ?? null,
      o.billingAddress === undefined ? null : JSON.stringify(o.billingAddress), o.notes ?? null,
      subtotal, discountTotal, taxTotal, total, paid,
    ],
  )
  const invoiceId = Number(inv.rows[0]!.id)

  for (const l of lines) {
    await pool.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_subtotal, discount_amount,
          taxable_amount, tax_name, tax_rate, tax_amount, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [invoiceId, l.description, l.quantity, l.unit, l.subtotal, l.discount, l.taxable, l.taxName, l.rate, l.tax, l.total],
    )
  }
  await pool.query(
    `INSERT INTO invoice_tax_details (invoice_id, tax_name, tax_rate, taxable_amount, tax_amount)
     SELECT invoice_id, COALESCE(tax_name, 'Tax'), tax_rate, sum(taxable_amount), sum(tax_amount)
       FROM invoice_items WHERE invoice_id = $1 AND (tax_name IS NOT NULL OR tax_rate > 0)
      GROUP BY invoice_id, COALESCE(tax_name, 'Tax'), tax_rate`,
    [invoiceId],
  )
  return invoiceId
}
