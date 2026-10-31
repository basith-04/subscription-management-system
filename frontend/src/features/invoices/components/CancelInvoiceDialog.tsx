import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { useCancelInvoice } from '../hooks/useInvoices'
import { InvoiceDialog } from './InvoiceDialog'

export const MAX_REASON = 500

export interface CancelInvoiceDialogProps {
  invoiceId: number
  invoiceNumber: string
  status: 'draft' | 'confirmed' | 'paid' | 'cancelled'
  onClose: () => void
  onCancelled: () => void
  /** Called when the server rejects with 409 so the page can refetch the real state. */
  onConflict?: () => void
}

export function CancelInvoiceDialog({ invoiceId, invoiceNumber, status, onClose, onCancelled, onConflict }: CancelInvoiceDialogProps) {
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [serverError, setServerError] = useState('')
  const cancel = useCancelInvoice(invoiceId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (cancel.isPending) return
    const trimmed = reason.trim()
    setServerError('')
    if (!trimmed) return setFieldError('A cancellation reason is required')
    if (trimmed.length > MAX_REASON) return setFieldError(`Reason must be at most ${MAX_REASON} characters`)
    setFieldError('')
    try {
      await cancel.mutateAsync(trimmed)
      onCancelled()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError(error.message) // e.g. "…void the payment first…"
        onConflict?.()
      } else setServerError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <InvoiceDialog title={`Cancel invoice ${invoiceNumber}`} onClose={onClose} busy={cancel.isPending}>
      <form onSubmit={(e) => void submit(e)} noValidate className="invoice-form">
        <p>
          {status === 'draft'
            ? 'This draft will be cancelled and cannot be reopened.'
            : 'This issued invoice will be cancelled and cannot be reopened.'}
        </p>
        <p className="invoice-muted">
          An invoice that has any payment recorded cannot be cancelled. An Admin must void the payment first, then cancel the invoice.
        </p>
        <label htmlFor="cancel-reason">Reason (required)</label>
        <textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={cancel.isPending}
          aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'cancel-reason-err' : undefined} />
        {fieldError && <p id="cancel-reason-err" className="field-error" role="alert">{fieldError}</p>}
        {serverError && <p className="invoice-error" role="alert">{serverError}</p>}
        <div className="invoice-actions">
          <button type="button" onClick={onClose} disabled={cancel.isPending}>Keep invoice</button>
          <button type="submit" className="invoice-danger" disabled={cancel.isPending}>{cancel.isPending ? 'Cancelling…' : 'Cancel invoice'}</button>
        </div>
      </form>
    </InvoiceDialog>
  )
}
