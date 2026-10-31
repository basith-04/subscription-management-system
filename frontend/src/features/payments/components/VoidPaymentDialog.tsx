import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { InvoiceDialog } from '../../invoices'
import { useVoidPayment } from '../hooks/usePayments'
import type { Payment, PaymentWithInvoices } from '../types'
import { METHOD_LABELS } from '../methodLabels'

export function VoidPaymentDialog({ payment, onClose, onVoided }: { payment: Payment; onClose: () => void; onVoided: (r: PaymentWithInvoices) => void }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const voidIt = useVoidPayment(payment.id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (voidIt.isPending) return
    setError('')
    if (!reason.trim()) return setFieldError('A void reason is required')
    if (!confirmed) return setFieldError('Confirm that you want to void this payment')
    setFieldError('')
    try {
      onVoided(await voidIt.mutateAsync(reason.trim()))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <InvoiceDialog title={`Void payment #${payment.id}`} onClose={onClose} busy={voidIt.isPending}>
      <form className="invoice-form" noValidate onSubmit={(e) => void submit(e)}>
        <dl className="alloc-totals">
          <div><dt>Amount</dt><dd>{payment.amount}</dd></div>
          <div><dt>Method</dt><dd>{METHOD_LABELS[payment.method]}</dd></div>
          <div><dt>Date</dt><dd>{payment.payment_date}</dd></div>
          <div><dt>Invoices</dt><dd>{payment.allocations.map((a) => a.invoice_number).join(', ')}</dd></div>
        </dl>
        <p className="invoice-error">
          Voiding reverses this payment's effect on every invoice it was allocated to. A paid invoice returns to confirmed
          and its outstanding balance is restored. The payment stays in the history, marked as voided. This cannot be undone.
        </p>
        <label htmlFor="void-reason">Reason (required)</label>
        <textarea id="void-reason" rows={3} value={reason} disabled={voidIt.isPending} aria-invalid={Boolean(fieldError)} onChange={(e) => setReason(e.target.value)} />
        <label className="alloc-confirm"><input type="checkbox" checked={confirmed} disabled={voidIt.isPending} onChange={(e) => setConfirmed(e.target.checked)} /> I understand this reverses the payment</label>
        {fieldError && <p role="alert" className="field-error">{fieldError}</p>}
        {error && <p role="alert" className="invoice-error">{error}</p>}
        <div className="invoice-actions">
          <button type="button" onClick={onClose} disabled={voidIt.isPending}>Keep payment</button>
          <button type="submit" className="invoice-danger" disabled={voidIt.isPending}>{voidIt.isPending ? 'Voiding…' : 'Void payment'}</button>
        </div>
      </form>
    </InvoiceDialog>
  )
}
