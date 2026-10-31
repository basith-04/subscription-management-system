import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { useSendInvoice } from '../hooks/useInvoices'
import { InvoiceDialog } from './InvoiceDialog'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
export const MAX_MESSAGE = 1000

export interface SendInvoiceDialogProps {
  invoiceId: number
  invoiceNumber: string
  /** The customer snapshot email on the invoice; the default recipient. */
  defaultEmail: string
  onClose: () => void
  /** Called with the address the server actually mailed. */
  onSent: (recipient: string) => void
}

export function SendInvoiceDialog({ invoiceId, invoiceNumber, defaultEmail, onClose, onSent }: SendInvoiceDialogProps) {
  const [to, setTo] = useState(defaultEmail)
  const [message, setMessage] = useState('')
  const [fieldError, setFieldError] = useState<{ to?: string; message?: string }>({})
  const [serverError, setServerError] = useState('')
  const send = useSendInvoice(invoiceId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (send.isPending) return // duplicate-submit guard
    const errors: { to?: string; message?: string } = {}
    const recipient = to.trim()
    if (!EMAIL_RE.test(recipient)) errors.to = 'Enter a valid email address'
    if (message.length > MAX_MESSAGE) errors.message = `Message must be at most ${MAX_MESSAGE} characters`
    setFieldError(errors)
    setServerError('')
    if (errors.to || errors.message) return
    try {
      const result = await send.mutateAsync({
        ...(recipient.toLowerCase() !== defaultEmail.toLowerCase() ? { to: recipient } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      })
      onSent(result.sent_to)
    } catch (error) {
      if (error instanceof ApiError && error.status === 502) setServerError('The email could not be sent. The invoice was not changed — please try again.')
      else if (error instanceof ApiError && error.status === 422) {
        setFieldError({ to: error.details.find((d) => d.field === 'to')?.message, message: error.details.find((d) => d.field === 'message')?.message })
        setServerError(error.details.length ? '' : error.message)
      } else setServerError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <InvoiceDialog title={`Send invoice ${invoiceNumber}`} onClose={onClose} busy={send.isPending}>
      <form onSubmit={(e) => void submit(e)} noValidate className="invoice-form">
        <label htmlFor="send-to">Recipient</label>
        <input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} disabled={send.isPending}
          aria-invalid={Boolean(fieldError.to)} aria-describedby={fieldError.to ? 'send-to-err' : undefined} />
        {fieldError.to && <p id="send-to-err" className="field-error" role="alert">{fieldError.to}</p>}

        <label htmlFor="send-message">Message (optional)</label>
        <textarea id="send-message" rows={4} value={message} maxLength={MAX_MESSAGE + 200} onChange={(e) => setMessage(e.target.value)}
          disabled={send.isPending} aria-invalid={Boolean(fieldError.message)} />
        <p className="invoice-muted">{message.length}/{MAX_MESSAGE}</p>
        {fieldError.message && <p className="field-error" role="alert">{fieldError.message}</p>}

        {serverError && <p className="invoice-error" role="alert">{serverError}</p>}
        <div className="invoice-actions">
          <button type="button" onClick={onClose} disabled={send.isPending}>Cancel</button>
          <button type="submit" className="invoice-primary" disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send invoice'}</button>
        </div>
      </form>
    </InvoiceDialog>
  )
}
