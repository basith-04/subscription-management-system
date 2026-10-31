// Entry points used ONLY by the payments module (F13) to change an invoice's paid amount.
// F11 keeps ownership of the invoice state machine: the only legal payment-driven transitions are
// confirmed → paid and paid → confirmed (state-machines.md §3.3), taken through assertTransition(…, 'payments').
import type { Queryable } from '../../lib/db.js'
import { ApiError } from '../../lib/errors.js'
import { sub } from '../../lib/money.js'
import { type InvoiceStatus } from './invoices.constants.js'
import { assertTransition, invalidTransition, statusAfterBalanceChange } from './invoices.state-machine.js'

export interface PaymentInvoiceRow {
  id: number
  number: string
  customer_id: number
  status: InvoiceStatus
  due_date: string
  total: string
  amount_paid: string
  amount_due: string
}

/** Lock the invoices in id order (consistent order prevents deadlocks) and return their current balances. */
export async function lockInvoicesForPayment(tx: Queryable, ids: number[]): Promise<PaymentInvoiceRow[]> {
  const r = await tx.query<{
    id: string; number: string; customer_id: string; status: InvoiceStatus; due_date: string
    total: string; amount_paid: string; amount_due: string
  }>(
    `SELECT id, number, customer_id, status, due_date::text AS due_date, total, amount_paid, amount_due
       FROM invoices WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
    [[...new Set(ids)]],
  )
  return r.rows.map((x) => ({ ...x, id: Number(x.id), customer_id: Number(x.customer_id) }))
}

/** Σ of the amounts of NON-voided payments allocated to the invoice (the reconciliation source of truth). */
export async function activeAllocationTotal(tx: Queryable, invoiceId: number): Promise<string> {
  const r = await tx.query<{ total: string }>(
    `SELECT COALESCE(sum(pa.amount), 0)::numeric(12,2)::text AS total
       FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = $1 AND p.voided_at IS NULL`,
    [invoiceId],
  )
  return r.rows[0]!.total
}

export interface AppliedBalance {
  id: number
  previous_status: InvoiceStatus
  status: InvoiceStatus
  amount_paid: string
  amount_due: string
}

/**
 * Set the invoice's amount_paid and move its status when the balance crosses zero. The row must be locked by the
 * caller. Conditional on the expected status, so a concurrent change surfaces as a 409 instead of a lost update.
 */
export async function applyPaidAmount(tx: Queryable, invoice: PaymentInvoiceRow, newAmountPaid: string): Promise<AppliedBalance> {
  const target = statusAfterBalanceChange(invoice.status, invoice.total, newAmountPaid)
  if (target !== invoice.status) assertTransition(invoice.status, target, 'payments')
  if (sub(invoice.total, newAmountPaid).startsWith('-')) {
    throw new ApiError(422, 'ALLOCATION_EXCEEDS_AMOUNT_DUE', `Payment would overpay invoice ${invoice.number}`)
  }
  const r = await tx.query<{ status: InvoiceStatus; amount_paid: string; amount_due: string }>(
    `UPDATE invoices SET amount_paid = $3, status = $4,
            paid_at = CASE WHEN $4 = 'paid' AND status <> 'paid' THEN now()
                           WHEN $4 <> 'paid' THEN NULL ELSE paid_at END,
            updated_at = now()
      WHERE id = $1 AND status = $2
      RETURNING status, amount_paid, amount_due`,
    [invoice.id, invoice.status, newAmountPaid, target],
  )
  const row = r.rows[0]
  if (!row) throw invalidTransition(invoice.status, target, 'the invoice changed while the payment was processed')
  return { id: invoice.id, previous_status: invoice.status, status: row.status, amount_paid: row.amount_paid, amount_due: row.amount_due }
}

