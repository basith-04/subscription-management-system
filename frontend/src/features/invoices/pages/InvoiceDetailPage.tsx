import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Toast } from '../../../components/ui/Toast'
import { ApiError } from '../../../lib/api'
import { useAuth } from '../../auth/useAuth'
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog'
import { DraftEditPanel } from '../components/DraftEditPanel'
import { DiscountSlot, PaymentsSlot } from '../components/InvoiceDetailSlots'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { SendInvoiceDialog } from '../components/SendInvoiceDialog'
import { useConfirmInvoice, useInvoice } from '../hooks/useInvoices'
import { EntityHistoryLink } from '../../audit-logs'
import '../invoices.css'

type Dialog = null | 'confirm' | 'cancel' | 'send'

export function InvoiceDetailPage({ id: idProp }: { id?: number } = {}) {
  const params = useParams()
  const id = idProp ?? Number(params.id)
  const { user } = useAuth()
  const query = useInvoice(id)
  const confirm = useConfirmInvoice(id)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [banner, setBanner] = useState('')
  const [toast, setToast] = useState('')

  if (query.isPending) return <section className="invoices-page" aria-busy="true"><div className="invoice-skeleton" role="status">Loading invoice…</div></section>
  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <section className="invoices-page">
        <p role="alert" className="invoice-error">{notFound ? 'Invoice not found.' : 'Unable to load this invoice.'}</p>
        {!notFound && <button type="button" onClick={() => void query.refetch()}>Retry</button>}
        <p><Link to="/app/invoices">Back to invoices</Link></p>
      </section>
    )
  }

  const invoice = query.data
  const staffBlocked = invoice.status === 'confirmed' && Number(invoice.amount_paid) > 0
  const showConflict = (message: string) => { setBanner(message); void query.refetch() }

  async function doConfirm() {
    setDialog(null)
    if (confirm.isPending) return
    setBanner('')
    try {
      await confirm.mutateAsync()
      setToast(`Invoice ${invoice.number} confirmed.`)
    } catch (e) {
      showConflict(e instanceof ApiError ? e.message : 'Could not confirm the invoice.')
    }
  }

  return (
    <section className="invoices-page">
      <p><Link to="/app/invoices">← Invoices</Link></p>
      <header className="invoices-header">
        <h1>Invoice {invoice.number}</h1>
        <div className="invoice-actions" role="toolbar" aria-label="Invoice actions">
          {user?.role === 'admin' && <EntityHistoryLink entityType="invoice" entityId={invoice.id}>Audit history</EntityHistoryLink>}
          {invoice.can_confirm && <button type="button" className="invoice-primary" disabled={confirm.isPending} onClick={() => setDialog('confirm')}>{confirm.isPending ? 'Confirming…' : 'Confirm'}</button>}
          {invoice.can_send && <button type="button" onClick={() => setDialog('send')}>{invoice.sent_at ? 'Send again' : 'Send'}</button>}
          <button type="button" onClick={() => window.open(`/print/invoices/${invoice.id}`, '_blank', 'noopener')}>Print</button>
          {invoice.can_cancel && <button type="button" className="invoice-danger" onClick={() => setDialog('cancel')}>Cancel invoice</button>}
        </div>
      </header>

      {staffBlocked && (
        <p className="invoice-muted" data-testid="cancel-blocked">
          This invoice has a payment recorded and cannot be cancelled.{' '}
          {user?.role === 'admin' ? 'Void the payment first, then cancel it.' : 'Ask an Admin to void the payment first.'}
        </p>
      )}
      {banner && <p role="alert" className="invoice-error">{banner}</p>}
      {invoice.sent_at && <p className="invoice-muted">Last sent {new Date(invoice.sent_at).toLocaleString()}</p>}
      {invoice.status === 'cancelled' && invoice.cancel_reason && <p className="invoice-muted">Cancelled: {invoice.cancel_reason}</p>}

      <InvoiceDocument invoice={invoice} />

      {invoice.can_edit && <DraftEditPanel invoice={invoice} onConflict={() => showConflict('This invoice is no longer a draft.')} />}
      <PaymentsSlot invoice={invoice} />
      <DiscountSlot invoice={invoice} />

      <ConfirmDialog isOpen={dialog === 'confirm'} title={`Confirm invoice ${invoice.number}?`}
        message="Confirming issues the invoice and locks its lines. This cannot be undone."
        confirmLabel="Confirm invoice" onConfirm={() => void doConfirm()} onCancel={() => setDialog(null)} />
      {dialog === 'send' && (
        <SendInvoiceDialog invoiceId={invoice.id} invoiceNumber={invoice.number} defaultEmail={invoice.customer.email}
          onClose={() => setDialog(null)} onSent={(to) => { setDialog(null); setToast(`Invoice ${invoice.number} sent to ${to}.`) }} />
      )}
      {dialog === 'cancel' && (
        <CancelInvoiceDialog invoiceId={invoice.id} invoiceNumber={invoice.number} status={invoice.status}
          onClose={() => setDialog(null)} onCancelled={() => { setDialog(null); setToast(`Invoice ${invoice.number} cancelled.`) }}
          onConflict={() => void query.refetch()} />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}
