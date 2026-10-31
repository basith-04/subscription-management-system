import { useSearchParams } from 'react-router-dom'
import { QueryState } from '../components/QueryState'
import { SubscriptionCard } from '../components/SubscriptionCard'
import { useMySubscriptions } from '../hooks/usePortal'

const STATUSES = ['quotation', 'confirmed', 'active', 'closed'] as const

export function MySubscriptionsPage() {
  const [sp, setSp] = useSearchParams()
  const status = STATUSES.find((s) => s === sp.get('status'))
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const q = useMySubscriptions({ ...(status ? { status } : {}), page })
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    setSp(next, { replace: true })
  }
  const meta = q.data?.meta
  return (
    <div className="portal-stack">
      <h1>My subscriptions</h1>
      <label className="portal-field">Status
        <select value={status ?? ''} onChange={(e) => set({ status: e.target.value || null, page: null })}>
          <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select></label>
      <QueryState query={q} what="subscriptions">
        {q.data?.data.length === 0
          ? <p className="portal-empty">{status ? 'No subscriptions match this filter.' : 'You have no subscriptions yet.'}</p>
          : <div className="portal-grid">{q.data?.data.map((s) => <SubscriptionCard key={s.id} subscription={s} />)}</div>}
        {meta && meta.total_pages > 1 && (
          <div className="portal-pager">
            <button type="button" disabled={meta.page <= 1} onClick={() => set({ page: String(meta.page - 1) })}>Previous</button>
            <span>Page {meta.page} of {meta.total_pages}</span>
            <button type="button" disabled={meta.page >= meta.total_pages} onClick={() => set({ page: String(meta.page + 1) })}>Next</button>
          </div>
        )}
      </QueryState>
    </div>
  )
}
