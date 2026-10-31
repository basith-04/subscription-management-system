import { useState } from 'react'
import { Toast } from '../../../components/ui/Toast'
import { useAuth } from '../../auth/useAuth'
import { useInvoicePayments } from '../hooks/usePayments'
import type { Payment } from '../types'
import { METHOD_LABELS } from '../methodLabels'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { VoidPaymentDialog } from './VoidPaymentDialog'

export interface PaymentsPanelInvoice { id: number; number: string; status: string; customerId: number; amountDue: string }

/** The "Payments" panel mounted in the invoice detail page's payments slot. */
export function PaymentsPanel({ invoice }: { invoice: PaymentsPanelInvoice }) {
  const { user } = useAuth()
  const query = useInvoicePayments(invoice.id)
  const [recording, setRecording] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [toast, setToast] = useState('')
  const canRecord = invoice.status === 'confirmed' && Number(invoice.amountDue) > 0

  return (
    <section className="invoice-slot" data-slot="payments" aria-label="Payments">
      <div className="invoices-header">
        <h2>Payments</h2>
        {canRecord && <button type="button" className="invoice-primary" onClick={() => setRecording(true)}>Record payment</button>}
      </div>
      {query.isPending && <p role="status">Loading payments…</p>}
      {query.isError && <div role="alert" className="invoice-error"><p>Unable to load payments.</p><button type="button" onClick={() => void query.refetch()}>Retry</button></div>}
      {query.isSuccess && query.data.length === 0 && <p className="invoice-muted">No payments recorded yet.</p>}
      {query.isSuccess && query.data.length > 0 && (
        <table className="invoice-table" aria-label="Payment history">
          <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Allocated to</th><th>Status</th><th /></tr></thead>
          <tbody>
            {query.data.map((p) => {
              return (
                <tr key={p.id} className={p.is_voided ? 'payment-voided' : undefined}>
                  <td data-label="Date">{p.payment_date}</td>
                  <td data-label="Method">{METHOD_LABELS[p.method]}</td>
                  <td data-label="Reference">{p.reference_number ?? '—'}</td>
                  <td data-label="Amount" className="num">{p.amount}</td>
                  <td data-label="Allocated to">{p.allocations.map((a) => `${a.invoice_number} (${a.amount})`).join(', ')}</td>
                  <td data-label="Status">{p.is_voided ? <span className="payment-badge payment-badge--cancelled" title={p.void_reason ?? ''}>Voided</span> : 'Recorded'}</td>
                  <td>{user?.role === 'admin' && !p.is_voided && <button type="button" aria-label={`Void payment ${p.id}`} onClick={() => setVoiding(p)}>Void</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {recording && (
        <RecordPaymentDialog invoice={{ id: invoice.id, number: invoice.number, customerId: invoice.customerId, amountDue: invoice.amountDue }}
          onClose={() => setRecording(false)}
          onRecorded={(r) => { setRecording(false); setToast(`Payment recorded for ${r.invoices.map((i) => i.number).join(', ')}.`) }} />
      )}
      {voiding && (
        <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)}
          onVoided={(r) => { setVoiding(null); setToast(`Payment voided; ${r.invoices.map((i) => i.number).join(', ')} updated.`) }} />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}
