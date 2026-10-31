// Pure, decimal-safe payment maths and allocation validation (no I/O). Money is string / BigInt minor units.
import { add, compare, sub } from '../../lib/money.js'

export interface AllocationInput { invoice_id: number; amount: string }
export interface BalanceInvoice {
  id: number
  number: string
  customer_id: number
  status: string
  amount_due: string
}

export type AllocationIssueCode =
  | 'UNKNOWN_INVOICE'
  | 'INVOICE_NOT_CONFIRMED'
  | 'MIXED_CUSTOMERS'
  | 'ALLOCATION_EXCEEDS_AMOUNT_DUE'
  | 'ALLOCATIONS_EXCEED_PAYMENT'
  | 'DUPLICATE_INVOICE'

export interface AllocationIssue { code: AllocationIssueCode; field: string; message: string; invoice_id?: number }

export const sumMoney = (values: readonly string[]): string => values.reduce((acc, v) => add(acc, v), '0.00')

/** 0.10 + 0.20 === 0.30, always. */
export const remainingAfter = (paymentAmount: string, allocations: readonly AllocationInput[]): string =>
  sub(paymentAmount, sumMoney(allocations.map((a) => a.amount)))

/**
 * Validate a payment's allocations against the locked invoice balances. Returns every issue found
 * (the service maps the most severe to an HTTP error). `invoices` must be the locked, current rows.
 */
export function validateAllocations(
  paymentAmount: string,
  allocations: readonly AllocationInput[],
  invoices: ReadonlyMap<number, BalanceInvoice>,
): AllocationIssue[] {
  const issues: AllocationIssue[] = []
  const seen = new Set<number>()
  const customers = new Set<number>()
  allocations.forEach((a, i) => {
    const field = `allocations.${i}`
    if (seen.has(a.invoice_id)) issues.push({ code: 'DUPLICATE_INVOICE', field: `${field}.invoice_id`, message: 'An invoice can appear only once per payment', invoice_id: a.invoice_id })
    seen.add(a.invoice_id)
    const inv = invoices.get(a.invoice_id)
    if (!inv) return void issues.push({ code: 'UNKNOWN_INVOICE', field: `${field}.invoice_id`, message: 'Invoice not found', invoice_id: a.invoice_id })
    customers.add(inv.customer_id)
    if (inv.status !== 'confirmed') {
      issues.push({ code: 'INVOICE_NOT_CONFIRMED', field: `${field}.invoice_id`, message: `Invoice ${inv.number} is ${inv.status}; only confirmed invoices can receive payments`, invoice_id: inv.id })
    } else if (compare(a.amount, inv.amount_due) > 0) {
      issues.push({ code: 'ALLOCATION_EXCEEDS_AMOUNT_DUE', field: `${field}.amount`, message: `Amount exceeds the ${inv.amount_due} due on invoice ${inv.number}`, invoice_id: inv.id })
    }
  })
  if (customers.size > 1) issues.push({ code: 'MIXED_CUSTOMERS', field: 'allocations', message: 'All invoices in one payment must belong to the same customer' })
  if (compare(sumMoney(allocations.map((a) => a.amount)), paymentAmount) > 0) {
    issues.push({ code: 'ALLOCATIONS_EXCEED_PAYMENT', field: 'allocations', message: 'Allocations cannot exceed the payment amount' })
  }
  return issues
}
