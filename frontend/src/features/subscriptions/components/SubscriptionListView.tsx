import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CustomerSelect } from '../../customers'
import { PlanSelect } from '../../plans'
import { useQuotationList, useSubscriptionList } from '../hooks/useSubscriptions'
import type { ListParams, SubscriptionStatus } from '../types'
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge'

type Kind = 'quotations' | 'subscriptions'
const STATUSES: Record<Kind, SubscriptionStatus[]> = { quotations: ['draft', 'quotation'], subscriptions: ['draft', 'quotation', 'confirmed', 'active', 'closed'] }
const SORTS = [
  { value: '-created_at', label: 'Newest first' }, { value: 'created_at', label: 'Oldest first' }, { value: 'number', label: 'Number' },
  { value: 'expiry_date', label: 'Expiry soonest' }, { value: '-expiry_date', label: 'Expiry latest' },
]
const KEYS = ['status', 'customer_id', 'plan_id', 'q', 'expiry_from', 'expiry_to', 'valid_until_to'] as const
type Key = (typeof KEYS)[number]

/** URL is the single source of truth for filters, sort and page. */
function paramsFromSearch(sp: URLSearchParams, kind: Kind): ListParams {
  const posInt = (k: string) => { const n = Number.parseInt(sp.get(k) ?? '', 10); return Number.isSafeInteger(n) && n > 0 ? n : undefined }
  const status = sp.get('status') as SubscriptionStatus | null
  const sort = sp.get('sort')
  const p: ListParams = { sort: sort && SORTS.some((s) => s.value === sort) ? sort : '-created_at', page: posInt('page') ?? 1 }
  if (status && STATUSES[kind].includes(status)) p.status = status
  if (posInt('customer_id')) p.customer_id = posInt('customer_id') as number
  if (posInt('plan_id') && kind === 'subscriptions') p.plan_id = posInt('plan_id') as number
  if (sp.get('q')) p.q = sp.get('q') as string
  if (kind === 'subscriptions') { if (sp.get('expiry_from')) p.expiry_from = sp.get('expiry_from') as string; if (sp.get('expiry_to')) p.expiry_to = sp.get('expiry_to') as string }
  if (kind === 'quotations' && sp.get('valid_until_to')) p.valid_until_to = sp.get('valid_until_to') as string
  return p
}

export function SubscriptionListView({ kind }: { kind: Kind }) {
  const [sp, setSp] = useSearchParams()
  const params = paramsFromSearch(sp, kind)
  const quotes = useQuotationList(kind === 'quotations' ? params : {})
  const subs = useSubscriptionList(kind === 'subscriptions' ? params : {})
  const list = kind === 'quotations' ? quotes : subs
  const [form, setForm] = useState<Record<Key, string>>(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ''])) as Record<Key, string>)
  const [customerLabel, setCustomerLabel] = useState('')
  const base = kind === 'quotations' ? '/app/quotations' : '/app/subscriptions'

  const setParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    if (resetPage) next.delete('page')
    setSp(next, { replace: true })
  }
  const apply = (e: FormEvent) => { e.preventDefault(); setParams(Object.fromEntries(KEYS.map((k) => [k, form[k].trim() || null]))) }
  const clear = () => { setForm(Object.fromEntries(KEYS.map((k) => [k, ''])) as Record<Key, string>); setCustomerLabel(''); setParams(Object.fromEntries(KEYS.map((k) => [k, null]))) }
  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const filtered = KEYS.some((k) => sp.get(k))

  return (
    <section className="sub-page">
      <header className="sub-header">
        <h1>{kind === 'quotations' ? 'Quotations' : 'Subscriptions'}</h1>
        {kind === 'quotations' && <Link className="sub-primary-link" to="/app/quotations/new">New quotation</Link>}
      </header>
      <form className="sub-filters" onSubmit={apply} aria-label="Filters">
        <label>Search<input type="search" value={form.q} placeholder="Number or customer" onChange={(e) => setForm({ ...form, q: e.target.value })} /></label>
        <label>Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="">Any</option>{STATUSES[kind].map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <div className="sub-field"><span>Customer</span>
          <CustomerSelect label="Customer" activeOnly={false} value={form.customer_id ? Number(form.customer_id) : null}
            initialLabel={customerLabel || (form.customer_id ? `Customer #${form.customer_id}` : '')}
            onChange={(id, c) => { setForm({ ...form, customer_id: id ? String(id) : '' }); setCustomerLabel(c?.name ?? '') }} /></div>
        {kind === 'subscriptions' && <>
          <div className="sub-field"><PlanSelect id="filter-plan" label="Plan" value={form.plan_id ? Number(form.plan_id) : null} onChange={(id) => setForm({ ...form, plan_id: id ? String(id) : '' })} /></div>
          <label>Expiry from<input type="date" value={form.expiry_from} onChange={(e) => setForm({ ...form, expiry_from: e.target.value })} /></label>
          <label>Expiry to<input type="date" value={form.expiry_to} onChange={(e) => setForm({ ...form, expiry_to: e.target.value })} /></label>
        </>}
        {kind === 'quotations' && <label>Valid until (to)<input type="date" value={form.valid_until_to} onChange={(e) => setForm({ ...form, valid_until_to: e.target.value })} /></label>}
        <label>Sort
          <select value={params.sort} onChange={(e) => setParams({ sort: e.target.value })}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <div className="sub-actions"><button type="submit" className="sub-primary">Apply</button><button type="button" onClick={clear}>Clear</button></div>
      </form>

      {list.isPending && <p role="status" aria-busy="true">Loading {kind}…</p>}
      {list.isError && <div role="alert" className="sub-error"><p>Unable to load {kind}.</p><button type="button" onClick={() => void list.refetch()}>Retry</button></div>}
      {list.isSuccess && rows.length === 0 && (
        <div className="sub-empty">
          <p>{filtered ? `No ${kind} match these filters.` : `No ${kind} yet.`}</p>
          {filtered ? <button type="button" onClick={clear}>Clear filters</button> : kind === 'quotations' && <Link className="sub-primary-link" to="/app/quotations/new">Create quotation</Link>}
        </div>
      )}
      {rows.length > 0 && (
        <table className="sub-table" aria-label={kind === 'quotations' ? 'Quotations' : 'Subscriptions'}>
          <thead><tr><th>Number</th><th>Customer</th><th>Plan</th><th>Status</th><th>Start</th><th>Expiry</th>{kind === 'quotations' && <th>Valid until</th>}<th className="num">Total / period</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Number"><Link to={`${base}/${r.id}`}>{r.number}</Link></td>
                <td data-label="Customer">{r.customer.name}</td>
                <td data-label="Plan">{r.plan.name}</td>
                <td data-label="Status"><SubscriptionStatusBadge status={r.status} displayStatus={r.display_status} /></td>
                <td data-label="Start">{r.start_date}</td>
                <td data-label="Expiry">{r.expiry_date}</td>
                {kind === 'quotations' && <td data-label="Valid until">{r.quotation_valid_until ?? '—'}</td>}
                <td data-label="Total / period" className="num">{r.total_per_period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {meta && meta.total_pages > 1 && (
        <div className="sub-pager">
          <button type="button" disabled={meta.page <= 1} onClick={() => setParams({ page: String(meta.page - 1) }, false)}>Previous</button>
          <span>Page {meta.page} of {meta.total_pages}</span>
          <button type="button" disabled={meta.page >= meta.total_pages} onClick={() => setParams({ page: String(meta.page + 1) }, false)}>Next</button>
        </div>
      )}
    </section>
  )
}
