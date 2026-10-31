import { Link } from 'react-router-dom'
import { PaymentStateBadge } from '../../invoices'
import { OutstandingSummary } from '../components/OutstandingSummary'
import { QueryState } from '../components/QueryState'
import { SubscriptionCard } from '../components/SubscriptionCard'
import { useMyInvoices, useMySubscriptions } from '../hooks/usePortal'
import { Money } from '../../invoices'

export function PortalHomePage() {
  const active = useMySubscriptions({ status: 'active', page_size: 5 })
  const quotes = useMySubscriptions({ status: 'quotation', page_size: 5 })
  const invoices = useMyInvoices({ page_size: 5 })
  return (
    <div className="portal-stack">
      <h1>Welcome</h1>
      <QueryState query={invoices} what="summary">
        {invoices.data && <OutstandingSummary summary={invoices.data.meta.summary} />}
      </QueryState>

      {quotes.data && quotes.data.data.length > 0 && (
        <section aria-label="Quotations awaiting you"><h2>Quotations awaiting your confirmation</h2>
          <div className="portal-grid">{quotes.data.data.map((s) => <SubscriptionCard key={s.id} subscription={s} />)}</div></section>
      )}

      <section aria-label="Active subscriptions"><h2>Active subscriptions</h2>
        <QueryState query={active} what="subscriptions">
          {active.data?.data.length === 0 ? <p className="portal-empty">You have no active subscriptions yet.</p>
            : <div className="portal-grid">{active.data?.data.map((s) => <SubscriptionCard key={s.id} subscription={s} />)}</div>}
          <p><Link to="/portal/subscriptions">All subscriptions</Link></p>
        </QueryState>
      </section>

      <section aria-label="Recent invoices"><h2>Recent invoices</h2>
        <QueryState query={invoices} what="invoices">
          {invoices.data?.data.length === 0 ? <p className="portal-empty">You have no invoices yet.</p> : (
            <ul className="portal-list">
              {invoices.data?.data.map((i) => (
                <li key={i.id}><Link to={`/portal/invoices/${i.id}`}>{i.number}</Link> <PaymentStateBadge state={i.payment_state} /> <span>due {i.due_date}</span> <Money value={i.amount_due} /></li>
              ))}
            </ul>
          )}
          <p><Link to="/portal/invoices">All invoices</Link></p>
        </QueryState>
      </section>
    </div>
  )
}
