import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { CustomerSelect } from '../../customers'
import { Money } from '../components/Money'
import { PaymentStateBadge } from '../components/PaymentStateBadge'
import { useBulkConfirm, useInvoiceList } from '../hooks/useInvoices'
import type { BulkConfirmResult, InvoiceListParams, InvoiceStatus, PaymentState } from '../types'
import '../invoices.css'

const OUTSTANDING = 'not_due,outstanding,partially_paid,overdue'

/** Quick tabs. Each is just a preset of the same URL filters (status / payment_state). */
const TABS: Array<{ key: string; label: string; status?: InvoiceStatus; payment_state?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft', status: 'draft' },
  { key: 'outstanding', label: 'Outstanding', payment_state: OUTSTANDING },
  { key: 'overdue', label: 'Overdue', payment_state: 'overdue' },
  { key: 'paid', label: 'Paid', status: 'paid' },
  { key: 'cancelled', label: 'Cancelled', status: 'cancelled' },
]

const STATUSES: InvoiceStatus[] = ['draft', 'confirmed', 'paid', 'cancelled']
const STATES: PaymentState[] = ['draft', 'not_due', 'outstanding', 'partially_paid', 'overdue', 'paid', 'cancelled']
const SORTS = [
  { value: '-issue_date', label: 'Newest issued' }, { value: 'issue_date', label: 'Oldest issued' },
  { value: 'due_date', label: 'Due soonest' }, { value: '-due_date', label: 'Due latest' },
  { value: '-total', label: 'Highest total' }, { value: 'total', label: 'Lowest total' },
  { value: 'number', label: 'Number (A–Z)' },
]
const FILTER_KEYS = ['status', 'payment_state', 'customer_id', 'subscription_id', 'issue_from', 'issue_to', 'due_from', 'due_to', 'q', 'min_total', 'max_total'] as const
type FilterKey = (typeof FILTER_KEYS)[number]

/** The URL is the single source of truth, so lists are shareable and survive reloads and back navigation. */
function paramsFromSearch(sp: URLSearchParams): InvoiceListParams {
  const num = (k: string) => { const n = Number.parseInt(sp.get(k) ?? '', 10); return Number.isSafeInteger(n) && n > 0 ? n : undefined }
  const status = sp.get('status') as InvoiceStatus | null
  const page = num('page') ?? 1
  const sort = sp.get('sort')
  return {
    ...(status && STATUSES.includes(status) ? { status } : {}),
    ...(sp.get('payment_state') ? { payment_state: sp.get('payment_state') as string } : {}),
    ...(num('customer_id') ? { customer_id: num('customer_id') as number } : {}),
    ...(num('subscription_id') ? { subscription_id: num('subscription_id') as number } : {}),
    ...(['issue_from', 'issue_to', 'due_from', 'due_to', 'q', 'min_total', 'max_total'] as const)
      .reduce<Record<string, string>>((acc, k) => (sp.get(k) ? { ...acc, [k]: sp.get(k) as string } : acc), {}),
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : '-issue_date',
    page,
  }
}

export function InvoiceListPage() {
  const [sp, setSp] = useSearchParams()
  const params = paramsFromSearch(sp)
  const list = useInvoiceList(params)
  const bulk = useBulkConfirm()
  const [form, setForm] = useState<Record<FilterKey, string>>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ''])) as Record<FilterKey, string>)
  const [customerLabel, setCustomerLabel] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<BulkConfirmResult | null>(null)
  const [bulkError, setBulkError] = useState('')

  const setParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    if (resetPage) next.delete('page')
    setSelected(new Set())
    setSp(next, { replace: true })
  }

  const activeTab = TABS.find((t) => (t.status ?? '') === (params.status ?? '') && (t.payment_state ?? '') === (params.payment_state ?? ''))?.key
  const selectTab = (tab: (typeof TABS)[number]) => {
    setForm((f) => ({ ...f, status: tab.status ?? '', payment_state: tab.payment_state ?? '' }))
    setParams({ status: tab.status ?? null, payment_state: tab.payment_state ?? null })
  }
  const apply = (e: FormEvent) => {
    e.preventDefault()
    setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, form[k].trim() || null])))
  }
  const clear = () => {
    setForm(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])) as Record<FilterKey, string>)
    setCustomerLabel('')
    setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))
  }

  const rows = list.data?.data ?? []
  const draftIds = rows.filter((r) => r.status === 'draft').map((r) => r.id)
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allDraftsSelected = draftIds.length > 0 && draftIds.every((id) => selected.has(id))

  async function runBulk() {
    setConfirming(false)
    if (bulk.isPending || selected.size === 0) return // duplicate-submission guard
    setBulkError(''); setResult(null)
    try {
      const res = await bulk.mutateAsync([...selected])
      setResult(res)
      setSelected(new Set())
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Bulk confirmation failed.')
    }
  }
  const numberOf = (id: number) => rows.find((r) => r.id === id)?.number ?? `#${id}`

  const meta = list.data?.meta
  const summary = meta?.summary

  return (
    <section className="invoices-page">
      <header className="invoices-header"><h1>Invoices</h1></header>

      <nav className="invoice-tabs" aria-label="Invoice views">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-current={activeTab === t.key ? 'page' : undefined}
            className={activeTab === t.key ? 'is-active' : ''} onClick={() => selectTab(t)}>{t.label}</button>
        ))}
      </nav>

      <form className="invoice-filters" onSubmit={apply} aria-label="Invoice filters">
        <label>Search<input type="search" value={form.q} placeholder="Number or customer" onChange={(e) => setForm({ ...form, q: e.target.value })} /></label>
        <label>Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="">Any</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Payment state
          <select value={form.payment_state} onChange={(e) => setForm({ ...form, payment_state: e.target.value })}>
            <option value="">Any</option>
            {form.payment_state.includes(',') && <option value={form.payment_state}>Outstanding (all unpaid)</option>}
            {STATES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
        <div className="invoice-filter-field">
          <span>Customer</span>
          <CustomerSelect label="Customer" activeOnly={false} value={form.customer_id ? Number(form.customer_id) : null}
            initialLabel={customerLabel || (form.customer_id ? `Customer #${form.customer_id}` : '')}
            onChange={(id, c) => { setForm({ ...form, customer_id: id ? String(id) : '' }); setCustomerLabel(c?.name ?? '') }} />
        </div>
        <label>Subscription ID<input inputMode="numeric" pattern="\d*" value={form.subscription_id} onChange={(e) => setForm({ ...form, subscription_id: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Issued from<input type="date" value={form.issue_from} onChange={(e) => setForm({ ...form, issue_from: e.target.value })} /></label>
        <label>Issued to<input type="date" value={form.issue_to} onChange={(e) => setForm({ ...form, issue_to: e.target.value })} /></label>
        <label>Due from<input type="date" value={form.due_from} onChange={(e) => setForm({ ...form, due_from: e.target.value })} /></label>
        <label>Due to<input type="date" value={form.due_to} onChange={(e) => setForm({ ...form, due_to: e.target.value })} /></label>
        <label>Min total<input inputMode="decimal" value={form.min_total} onChange={(e) => setForm({ ...form, min_total: e.target.value })} /></label>
        <label>Max total<input inputMode="decimal" value={form.max_total} onChange={(e) => setForm({ ...form, max_total: e.target.value })} /></label>
        <label>Sort
          <select value={params.sort} onChange={(e) => setParams({ sort: e.target.value })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <div className="invoice-actions"><button type="submit" className="invoice-primary">Apply</button><button type="button" onClick={clear}>Clear</button></div>
      </form>

      {summary && (
        <dl className="invoice-summary" aria-label="Summary for current filters">
          <div><dt>Invoices</dt><dd data-testid="summary-count">{summary.count}</dd></div>
          <div><dt>Total issued</dt><dd><Money value={summary.total} /></dd></div>
          <div><dt>Paid</dt><dd><Money value={summary.amount_paid} /></dd></div>
          <div><dt>Outstanding</dt><dd><Money value={summary.amount_due} /></dd></div>
        </dl>
      )}

      {selected.size > 0 && (
        <div className="invoice-bulkbar" role="region" aria-label="Bulk actions">
          <span>{selected.size} draft{selected.size === 1 ? '' : 's'} selected</span>
          <button type="button" className="invoice-primary" disabled={bulk.isPending} onClick={() => setConfirming(true)}>
            {bulk.isPending ? 'Confirming…' : 'Confirm selected'}
          </button>
        </div>
      )}
      {bulkError && <p role="alert" className="invoice-error">{bulkError}</p>}
      {result && (
        <div role="status" className="invoice-bulk-result" aria-label="Bulk confirmation result">
          <p><strong>{result.confirmed.length}</strong> confirmed, <strong>{result.failed.length}</strong> failed.</p>
          {result.confirmed.length > 0 && <ul>{result.confirmed.map((id) => <li key={id}>{numberOf(id)}: confirmed</li>)}</ul>}
          {result.failed.length > 0 && <ul>{result.failed.map((f) => <li key={f.id} className="invoice-error">{numberOf(f.id)}: {f.code}</li>)}</ul>}
          <button type="button" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}

      {list.isPending && <p role="status" aria-busy="true">Loading invoices…</p>}
      {list.isError && (
        <div role="alert" className="invoice-error">
          <p>Unable to load invoices.</p>
          <button type="button" onClick={() => void list.refetch()}>Retry</button>
        </div>
      )}
      {list.isSuccess && rows.length === 0 && (
        <div className="invoice-empty"><p>No invoices match these filters.</p><button type="button" onClick={clear}>Clear filters</button></div>
      )}
      {rows.length > 0 && (
        <table className="invoice-table" aria-label="Invoices">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="Select all drafts on this page" disabled={draftIds.length === 0} checked={allDraftsSelected}
                onChange={() => setSelected(allDraftsSelected ? new Set() : new Set(draftIds))} /></th>
              <th>Number</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Due amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Select">
                  {r.status === 'draft' && <input type="checkbox" aria-label={`Select ${r.number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}
                </td>
                <td data-label="Number"><Link to={`/app/invoices/${r.id}`}>{r.number}</Link></td>
                <td data-label="Customer">{r.customer.name}</td>
                <td data-label="Issued">{r.issue_date}</td>
                <td data-label="Due">{r.due_date}</td>
                <td data-label="Status"><PaymentStateBadge state={r.payment_state} /></td>
                <td data-label="Total" className="num"><Money value={r.total} /></td>
                <td data-label="Due amount" className="num"><Money value={r.amount_due} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {meta && meta.total_pages > 1 && (
        <div className="invoice-pager">
          <button type="button" disabled={meta.page <= 1} onClick={() => setParams({ page: String(meta.page - 1) }, false)}>Previous</button>
          <span>Page {meta.page} of {meta.total_pages}</span>
          <button type="button" disabled={meta.page >= meta.total_pages} onClick={() => setParams({ page: String(meta.page + 1) }, false)}>Next</button>
        </div>
      )}

      <ConfirmDialog isOpen={confirming} title={`Confirm ${selected.size} invoice${selected.size === 1 ? '' : 's'}?`}
        message="Each selected draft will be issued and its lines locked. Invoices that cannot be confirmed are reported individually."
        confirmLabel="Confirm selected" onConfirm={() => void runBulk()} onCancel={() => setConfirming(false)} />
    </section>
  )
}
