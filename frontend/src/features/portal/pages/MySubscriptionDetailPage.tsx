import { Link, useParams } from 'react-router-dom'
import { Money } from '../../invoices'
import { CustomerActionPanel } from '../components/CustomerActionPanel'
import { PortalNotFound } from '../components/PortalNotFound'
import { QueryState } from '../components/QueryState'
import { useMySubscription } from '../hooks/usePortal'

export function MySubscriptionDetailPage() {
  const id = Number(useParams().id)
  const valid = Number.isSafeInteger(id) && id > 0
  const q = useMySubscription(valid ? id : 0)
  if (!valid) return <PortalNotFound what="subscription" />
  return (
    <div className="portal-stack">
      <p><Link to="/portal/subscriptions">← My subscriptions</Link></p>
      <QueryState query={q} what="subscription">
        {q.data && (
          <>
            <h1>{q.data.number} <span className={`portal-badge portal-badge--${q.data.status}`}>{q.data.display_status}</span></h1>
            <dl className="portal-facts portal-card">
              <div><dt>Plan</dt><dd>{q.data.plan.name} ({q.data.plan.billing_frequency})</dd></div>
              <div><dt>Payment term</dt><dd>{q.data.payment_term}</dd></div>
              <div><dt>Start</dt><dd>{q.data.start_date}</dd></div>
              <div><dt>Expires</dt><dd>{q.data.expiry_date} ({q.data.days_to_expiry} days)</dd></div>
              <div><dt>Next billing</dt><dd>{q.data.next_billing_date ?? '—'}</dd></div>
              {q.data.status === 'quotation' && <div><dt>Quotation valid until</dt><dd>{q.data.quotation_valid_until ?? '—'}</dd></div>}
            </dl>
            <section aria-label="Lines"><h2>What’s included</h2>
              <ul className="portal-lines">
                {q.data.items.map((i, n) => (
                  <li key={n} className="portal-card">
                    <strong>{i.description}</strong>
                    <span>{i.quantity} × <Money value={i.unit_price} />{i.tax ? ` + ${i.tax.name}` : ''}</span>
                    <span>Line total <Money value={i.line_total} /></span>
                  </li>
                ))}
              </ul>
              <dl className="portal-summary" aria-label="Totals">
                <div><dt>Subtotal</dt><dd><Money value={q.data.totals.subtotal} /></dd></div>
                <div><dt>Tax</dt><dd><Money value={q.data.totals.estimated_tax} /></dd></div>
                <div><dt>Total per period</dt><dd data-testid="total"><Money value={q.data.totals.total} /></dd></div>
              </dl>
              <p className="portal-muted">Estimates before any discounts; your invoice is the final amount.</p>
            </section>
            <CustomerActionPanel subscriptionId={q.data.id} actions={q.data} />
          </>
        )}
      </QueryState>
    </div>
  )
}
