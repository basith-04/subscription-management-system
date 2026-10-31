import { compareAmounts, fromMinor, isAmount, sumAmounts, toMinor } from './money'

export interface AllocationRowState {
  invoice_id: number
  invoice_number: string
  /** Remaining balance of the invoice (amount_due) when the dialog opened. */
  amount_due: string
  /** What the user typed. */
  amount: string
}

export interface AllocationSummary {
  allocated: string
  unallocated: string
  rowErrors: Record<number, string>
  totalError: string | null
  valid: boolean
}

/** Live validation for the allocation editor: per-row caps, total cap and a positive-amount requirement. */
export function summarizeAllocations(paymentAmount: string, rows: readonly AllocationRowState[]): AllocationSummary {
  const rowErrors: Record<number, string> = {}
  for (const r of rows) {
    if (!isAmount(r.amount) || toMinor(r.amount) <= 0n) rowErrors[r.invoice_id] = 'Enter an amount greater than zero (max 2 decimals)'
    else if (compareAmounts(r.amount, r.amount_due) > 0) rowErrors[r.invoice_id] = `Cannot exceed the ${r.amount_due} due on ${r.invoice_number}`
  }
  const allocated = sumAmounts(rows.map((r) => r.amount))
  const paymentOk = isAmount(paymentAmount) && toMinor(paymentAmount) > 0n
  const unallocated = paymentOk ? fromMinor(toMinor(paymentAmount) - toMinor(allocated)) : '0.00'
  const totalError = paymentOk && toMinor(allocated) > toMinor(paymentAmount) ? 'Allocations exceed the payment amount' : null
  return { allocated, unallocated, rowErrors, totalError, valid: rows.length > 0 && Object.keys(rowErrors).length === 0 && !totalError }
}
