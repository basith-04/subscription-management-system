import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Toast } from '../../../components/ui/Toast'
import { ApiError } from '../../../lib/api'
import { InvoiceDialog } from '../../invoices'
import { useLifecycle, useSubscription } from '../hooks/useSubscriptions'
import { addDays } from '../money'
import { StatusTimeline } from './StatusTimeline'
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge'
import { todayLocal } from '../dates'
import { TotalsPanel } from './TotalsPanel'

type Dialog = null | 'issue' | 'confirm' | 'cancel'

/** Shared detail + action bar. `variant` decides which route family links point to and which slots render. */
export function SubscriptionView({ id, variant }: { id: number; variant: 'quotation' | 'subscription' }) {
  const query = useSubscription(id)
  const life = useLifecycle(id)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [validUntil, setValidUntil] = useState(addDays(todayLocal(), 14))
  const [reason, setReason] = useState('')
  const [banner, setBanner] = useState('')
  const [toast, setToast] = useState('')
  const busy = life.issue.isPending || life.confirm.isPending || life.cancel.isPending

  if (query.isPending) return <section className="sub-page" aria-busy="true"><div className="sub-skeleton" role="status">Loading…</div></section>
  if (query.isError || !query.data) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <section className="sub-page">
        <p role="alert" className="sub-error">{missing ? 'Not found.' : 'Unable to load this record.'}</p>
        {!missing && <button type="button" onClick={() => void query.refetch()}>Retry</button>}
        <p><Link to={variant === 'quotation' ? '/app/quotations' : '/app/subscriptions'}>Back to the list</Link></p>
      </section>
    )
  }
  const s = query.data

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return
    setBanner(''); setDialog(null)
    try { await action(); setToast(done) } catch (e) { setBanner(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); void query.refetch() }
  }

  return (
    <section className="sub-page">
      <p><Link to={variant === 'quotation' ? '/app/quotations' : '/app/subscriptions'}>← {variant === 'quotation' ? 'Quotations' : 'Subscriptions'}</Link></p>
      <header className="sub-header">
        <h1>{s.number} <SubscriptionStatusBadge status={s.status} displayStatus={s.display_status} /></h1>
        <div className="sub-actions" role="toolbar" aria-label="Actions">
          {s.can_edit && <Link className="sub-button" to={`/app/quotations/${s.id}/edit`}>Edit</Link>}
          {s.can_issue && <button type="button" className="sub-primary" disabled={busy} onClick={() => setDialog('issue')}>Issue quotation</button>}
          {s.can_confirm && <button type="button" className="sub-primary" disabled={busy} onClick={() => setDialog('confirm')}>Confirm</button>}
          {s.can_cancel && <button type="button" className="sub-danger" disabled={busy} onClick={() => setDialog('cancel')}>Cancel</button>}
        </div>
      </header>
      {banner && <p role="alert" className="sub-error">{banner}</p>}

      <dl className="sub-facts">
        <div><dt>Customer</dt><dd><Link to={`/app/customers/${s.customer.id}`}>{s.customer.name}</Link></dd></div>
        <div><dt>Plan</dt><dd>{s.plan.name} ({s.plan.billing_frequency})</dd></div>
        <div><dt>Payment term</dt><dd>{s.payment_term.name}</dd></div>
        <div><dt>Start</dt><dd>{s.start_date}</dd></div>
        <div><dt>Expiry</dt><dd>{s.expiry_date} ({s.days_to_expiry} days)</dd></div>
        <div><dt>Quotation valid until</dt><dd>{s.quotation_valid_until ?? '—'}</dd></div>
        {s.closed_reason && <div><dt>Closed</dt><dd>{s.closed_reason}</dd></div>}
      </dl>

      <table className="sub-table" aria-label="Lines">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th>Tax</th><th className="num">Line total</th></tr></thead>
        <tbody>
          {s.items.length === 0 && <tr><td colSpan={5} className="sub-muted">No lines yet.</td></tr>}
          {s.items.map((i) => (
            <tr key={i.id}>
              <td data-label="Description">{i.description}</td><td data-label="Qty" className="num">{i.quantity}</td>
              <td data-label="Unit price" className="num">{i.unit_price}</td>
              <td data-label="Tax">{i.tax_rule ? `${i.tax_rule.name} (${i.tax_rule.rate}%)` : '—'}</td>
              <td data-label="Line total" className="num">{i.line_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TotalsPanel totals={s.totals} />

      {variant === 'subscription' && (
        // Panel slots: each later feature fills ONLY its own section (do not add feature logic here).
        <>
          <section className="sub-section" data-slot="operations" aria-label="Operations"><h2>Operations</h2><p className="sub-muted">Activate, pause, renew and close appear here once subscription operations (F10) are available.</p></section>
          <section className="sub-section" data-slot="billing" aria-label="Billing history"><h2>Billing history</h2><p className="sub-muted">Invoices appear here once the billing engine (F12) is available.</p></section>
          <section className="sub-section" data-slot="discounts" aria-label="Discounts"><h2>Discounts</h2><p className="sub-muted">Granted discounts appear here once discounts (F15) are available.</p></section>
        </>
      )}
      <StatusTimeline subscriptionId={s.id} />

      {dialog === 'issue' && (
        <InvoiceDialog title={`Issue ${s.number}`} onClose={() => setDialog(null)} busy={busy}>
          <form className="sub-form" onSubmit={(e) => { e.preventDefault(); void run(() => life.issue.mutateAsync(validUntil || undefined), `${s.number} issued.`) }}>
            <label htmlFor="valid-until">Valid until</label>
            <input id="valid-until" type="date" value={validUntil} min={todayLocal()} onChange={(e) => setValidUntil(e.target.value)} />
            <div className="sub-actions"><button type="button" onClick={() => setDialog(null)}>Close</button><button type="submit" className="sub-primary" disabled={busy}>Issue quotation</button></div>
          </form>
        </InvoiceDialog>
      )}
      <ConfirmDialog isOpen={dialog === 'confirm'} title={`Confirm ${s.number}?`} message="The quotation becomes a confirmed subscription. Activation is a separate step."
        confirmLabel="Confirm" onConfirm={() => void run(() => life.confirm.mutateAsync(), `${s.number} confirmed.`)} onCancel={() => setDialog(null)} />
      {dialog === 'cancel' && (
        <InvoiceDialog title={`Cancel ${s.number}`} onClose={() => setDialog(null)} busy={busy}>
          <form className="sub-form" onSubmit={(e) => { e.preventDefault(); void run(() => life.cancel.mutateAsync(reason.trim() || undefined), `${s.number} cancelled.`) }}>
            <p>Cancelling closes this record permanently.</p>
            <label htmlFor="cancel-reason">Reason (optional)</label>
            <textarea id="cancel-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="sub-actions"><button type="button" onClick={() => setDialog(null)}>Keep</button><button type="submit" className="sub-danger" disabled={busy}>Cancel {variant === 'quotation' ? 'quotation' : 'subscription'}</button></div>
          </form>
        </InvoiceDialog>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}
