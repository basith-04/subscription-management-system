import { useHistory } from '../hooks/useSubscriptions'

const LABELS: Record<string, string> = {
  'subscription.create': 'Created', 'subscription.update': 'Edited', 'subscription.issue': 'Quotation issued',
  'subscription.confirm': 'Confirmed', 'subscription.cancel': 'Cancelled',
}

/** Status history from the audit log (GET /subscriptions/:id/history). */
export function StatusTimeline({ subscriptionId }: { subscriptionId: number }) {
  const q = useHistory(subscriptionId)
  return (
    <section className="sub-section" aria-label="Status history">
      <h2>History</h2>
      {q.isPending && <p role="status">Loading history…</p>}
      {q.isError && <div role="alert" className="sub-error"><p>Unable to load history.</p><button type="button" onClick={() => void q.refetch()}>Retry</button></div>}
      {q.isSuccess && q.data.length === 0 && <p className="sub-muted">No history yet.</p>}
      {q.isSuccess && q.data.length > 0 && (
        <ol className="sub-timeline">
          {q.data.map((h) => (
            <li key={h.id}>
              <strong>{LABELS[h.action] ?? h.action}</strong>
              {typeof h.new_values?.status === 'string' && <> → {String(h.new_values.status)}</>}
              <span className="sub-muted"> · {new Date(h.created_at).toLocaleString()}{h.actor?.name ? ` · ${h.actor.name}` : ''}</span>
              {typeof h.new_values?.reason === 'string' && <div className="sub-muted">Reason: {h.new_values.reason}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
