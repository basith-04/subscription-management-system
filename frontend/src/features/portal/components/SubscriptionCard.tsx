import { Link } from 'react-router-dom'
import type { MySubscription } from '../types'

/** Mobile-first card for one subscription. */
export function SubscriptionCard({ subscription: s }: { subscription: MySubscription }) {
  return (
    <article className="portal-card" aria-label={`Subscription ${s.number}`}>
      <header className="portal-card__head">
        <h3><Link to={`/portal/subscriptions/${s.id}`}>{s.number}</Link></h3>
        <span className={`portal-badge portal-badge--${s.status}`}>{s.display_status}</span>
      </header>
      <dl className="portal-facts">
        <div><dt>Plan</dt><dd>{s.plan.name}</dd></div>
        <div><dt>Next billing</dt><dd>{s.next_billing_date ?? '—'}</dd></div>
        <div><dt>Expires</dt><dd>{s.expiry_date}</dd></div>
        {s.status === 'quotation' && <div><dt>Valid until</dt><dd>{s.quotation_valid_until ?? '—'}</dd></div>}
      </dl>
      {s.can_confirm && <Link className="portal-button portal-button--primary" to={`/portal/subscriptions/${s.id}`}>Review and confirm</Link>}
    </article>
  )
}
