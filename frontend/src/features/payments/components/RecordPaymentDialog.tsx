import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { InvoiceDialog } from '../../invoices'
import { summarizeAllocations, type AllocationRowState } from '../allocation'
import { todayLocal } from '../dates'
import { useRecordPayment } from '../hooks/usePayments'
import { compareAmounts, isAmount, toMinor } from '../money'
import type { PaymentMethod, PaymentWithInvoices } from '../types'
import { AllocationEditor } from './AllocationEditor'
import { MethodSelect } from './MethodSelect'

export interface RecordPaymentInvoice { id: number; number: string; customerId: number; amountDue: string }
export interface RecordPaymentDialogProps {
  invoice: RecordPaymentInvoice
  onClose: () => void
  onRecorded: (result: PaymentWithInvoices) => void
}

type Errors = { method?: string; amount?: string; payment_date?: string; reference_number?: string; form?: string }

export function RecordPaymentDialog({ invoice, onClose, onRecorded }: RecordPaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [amount, setAmount] = useState(invoice.amountDue)
  const [date, setDate] = useState(todayLocal())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<AllocationRowState[]>([
    { invoice_id: invoice.id, invoice_number: invoice.number, amount_due: invoice.amountDue, amount: invoice.amountDue },
  ])
  const [errors, setErrors] = useState<Errors>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [duplicate, setDuplicate] = useState(false)
  const record = useRecordPayment()
  const today = todayLocal()

  /** With a single invoice the allocation follows the amount (capped at what is due). */
  function changeAmount(v: string) {
    setAmount(v)
    setDuplicate(false)
    if (rows.length === 1 && isAmount(v)) {
      const first = rows[0]!
      setRows([{ ...first, amount: compareAmounts(v, first.amount_due) > 0 ? first.amount_due : v }])
    }
  }

  function validate(): boolean {
    const e: Errors = {}
    if (!method) e.method = 'Select a payment method'
    if (!isAmount(amount) || toMinor(amount) <= 0n) e.amount = 'Enter an amount greater than zero with at most 2 decimals'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.payment_date = 'Enter a payment date'
    else if (date > today) e.payment_date = 'Payment date cannot be in the future'
    if (reference.length > 100) e.reference_number = 'Reference must be at most 100 characters'
    setErrors(e)
    return Object.keys(e).length === 0 && summarizeAllocations(amount, rows).valid
  }

  async function submit(e: FormEvent, confirmDuplicate = false) {
    e.preventDefault()
    if (record.isPending) return // duplicate-click guard (the server is still the authority)
    setRowErrors({})
    if (!validate()) return
    try {
      const result = await record.mutateAsync({
        method: method as PaymentMethod, amount: amount.trim(), payment_date: date,
        ...(reference.trim() ? { reference_number: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        allocations: rows.map((r) => ({ invoice_id: r.invoice_id, amount: r.amount.trim() })),
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      })
      onRecorded(result)
    } catch (err) {
      if (!(err instanceof ApiError)) return setErrors({ form: 'Something went wrong. Please try again.' })
      const next: Errors = {}
      const perRow: Record<number, string> = {}
      for (const d of err.details) {
        const m = /^allocations\.(\d+)\./.exec(d.field)
        if (m) { const row = rows[Number(m[1])]; if (row) perRow[row.invoice_id] = d.message }
        else if (d.field === 'payment_date') next.payment_date = d.message
        else if (d.field === 'reference_number') next.reference_number = d.message
        else if (d.field === 'amount') next.amount = d.message
      }
      setRowErrors(perRow)
      if (err.code === 'POSSIBLE_DUPLICATE_PAYMENT') setDuplicate(true)
      if (!Object.keys(next).length && !Object.keys(perRow).length) next.form = err.message
      else if (err.status === 409 || err.status === 422) next.form ??= err.code === 'POSSIBLE_DUPLICATE_PAYMENT' ? err.message : undefined
      setErrors(next)
    }
  }

  return (
    <InvoiceDialog title={`Record payment for ${invoice.number}`} onClose={onClose} busy={record.isPending}>
      <form className="invoice-form" noValidate onSubmit={(e) => void submit(e)}>
        <MethodSelect value={method} onChange={setMethod} disabled={record.isPending} invalid={Boolean(errors.method)} />
        {errors.method && <p role="alert" className="field-error">{errors.method}</p>}

        <label htmlFor="payment-amount">Amount</label>
        <input id="payment-amount" inputMode="decimal" value={amount} disabled={record.isPending} aria-invalid={Boolean(errors.amount)} onChange={(e) => changeAmount(e.target.value)} />
        {errors.amount && <p role="alert" className="field-error">{errors.amount}</p>}

        <label htmlFor="payment-date">Payment date</label>
        <input id="payment-date" type="date" value={date} max={today} disabled={record.isPending} aria-invalid={Boolean(errors.payment_date)} onChange={(e) => { setDate(e.target.value); setDuplicate(false) }} />
        {errors.payment_date && <p role="alert" className="field-error">{errors.payment_date}</p>}

        <label htmlFor="payment-reference">Reference number (optional)</label>
        <input id="payment-reference" value={reference} maxLength={120} disabled={record.isPending} aria-invalid={Boolean(errors.reference_number)} onChange={(e) => setReference(e.target.value)} />
        {errors.reference_number && <p role="alert" className="field-error">{errors.reference_number}</p>}

        <label htmlFor="payment-note">Note (optional)</label>
        <textarea id="payment-note" rows={2} maxLength={1000} value={note} disabled={record.isPending} onChange={(e) => setNote(e.target.value)} />

        <AllocationEditor customerId={invoice.customerId} paymentAmount={amount} rows={rows} onChange={setRows}
          lockedInvoiceId={invoice.id} disabled={record.isPending} serverErrors={rowErrors} />

        {errors.form && <p role="alert" className="invoice-error">{errors.form}</p>}
        {duplicate && (
          <p className="invoice-muted">
            This looks like a duplicate of a payment just recorded.{' '}
            <button type="button" disabled={record.isPending} onClick={(e) => void submit(e as unknown as FormEvent, true)}>Record anyway</button>
          </p>
        )}
        <div className="invoice-actions">
          <button type="button" onClick={onClose} disabled={record.isPending}>Cancel</button>
          <button type="submit" className="invoice-primary" disabled={record.isPending}>{record.isPending ? 'Recording…' : 'Record payment'}</button>
        </div>
      </form>
    </InvoiceDialog>
  )
}
