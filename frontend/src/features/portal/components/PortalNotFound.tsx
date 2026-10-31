import { Link } from 'react-router-dom'

/** Neutral not-found: identical for "does not exist" and "not yours" — it never hints that the record exists. */
export function PortalNotFound({ what = 'page' }: { what?: string }) {
  return (
    <section className="portal-card" role="alert" aria-label="Not found">
      <h1>Not found</h1>
      <p>We couldn’t find that {what}.</p>
      <p><Link to="/portal">Back to home</Link></p>
    </section>
  )
}
