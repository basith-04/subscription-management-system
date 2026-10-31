import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PAYMENT_METHODS, type PaymentListParams, type PaymentMethod } from '../types'
import { CustomerSelect } from '../../customers'
import { usePaymentList } from '../hooks/usePayments'
import { MethodSelect } from '../components/MethodSelect'
import { METHOD_LABELS } from '../methodLabels'
import '../../invoices/invoices.css'

const SORTS = [
  { value: '-payment_date', label: 'Newest first' }, { value: 'payment_date', label: 'Oldest first' },
  { value: '-amount', label: 'Highest amount' }, { value: 'amount', label: 'Lowest amount' },
]
const KEYS = ['method', 'customer_id', 'invoice_id', 'date_from', 'date_to', 'voided', 'q'] as const
type Key = (typeof KEYS)[number]

/** URL is the single source of truth for filters, sort and page. */
function paramsFromSearch(sp: URLSearchParams): PaymentListParams {
  const posInt = (k: string) => { const n = Number.parseInt(sp.get(k) ?? '', 10); return Number.isSafeInteger(n) && n > 0 ? n : undefined }
  const method = sp.get('method') as PaymentMethod | null
  const voided = sp.get('voided')
  const sort = sp.get('sort')
  return {
    ...(method && PAYMENT_METHODS.includes(method) ? { method } : {}),
    ...(posInt('customer_id') ? { customer_id: posInt('customer_id') as number } : {}),
    ...(posInt('invoice_id') ? { invoice_id: posInt('invoice_id') as number } : {}),
    ...(sp.get('date_from') ? { date_from: sp.get('date_from') as string } : {}),
    ...(sp.get('date_to') ? { date_to: sp.get('date_to') as string } : {}),
    ...(voided === 'true' || voided === 'false' ? { voided: voided === 'true' } : {}),
    ...(sp.get('q') ? { q: sp.get('q') as string } : {}),
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : '-payment_date',
    page: posInt('page') ?? 1,
  }
}

export function PaymentListPage() {
  const [sp, setSp] = useSearchParams()
  const params = paramsFromSearch(sp)
  const list = usePaymentList(params)
  const [form, setForm] = useState<Record<Key, string>>(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ''])) as Record<Key, string>)
  const [customerLabel, setCustomerLabel] = useState('')

  const setParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    if (resetPage) next.delete('page')
    setSp(next, { replace: true })
  }
  const apply = (e: FormEvent) => { e.preventDefault(); setParams(Object.fromEntries(KEYS.map((k) => [k, form[k].trim() || null]))) }
  const clear = () => {
    setForm(Object.fromEntries(KEYS.map((k) => [k, ''])) as Record<Key, string>); setCustomerLabel('')
    setParams(Object.fromEntries(KEYS.map((k) => [k, null])))
  }
  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <section className="invoices-page">
      <header className="invoices-header"><h1>Payments</h1></header>
      <form className="invoice-filters" onSubmit={apply} aria-label="Payment filters">
        <label>Search<input type="search" value={form.q} placeholder="Reference or customer" onChange={(e) => setForm({ ...form, q: e.target.value })} /></label>
        <MethodSelect id="filter-method" label="Method" allowAny value={form.method as PaymentMethod | ''} onChange={(m) => setForm({ ...form, method: m })} />
        <div className="invoice-filter-field"><span>Customer</span>
          <CustomerSelect label="Customer" activeOnly={false} value={form.customer_id ? Number(form.customer_id) : null}
            initialLabel={customerLabel || (form.customer_id ? `Customer #${form.customer_id}` : '')}
            onChange={(id, c) => { setForm({ ...form, customer_id: id ? String(id) : '' }); setCustomerLabel(c?.name ?? '') }} />
        </div>
        <label>Invoice ID<input inputMode="numeric" value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Paid from<input type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} /></label>
        <label>Paid to<input type="date" value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} /></label>
        <label>Status
          <select value={form.voided} onChange={(e) => setForm({ ...form, voided: e.target.value })}>
            <option value="">All</option><option value="false">Not voided</option><option value="true">Voided</option>
          </select>
        </label>
        <label>Sort
          <select value={params.sort} onChange={(e) => setParams({ sort: e.target.value })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <div className="invoice-actions"><button type="submit" className="invoice-primary">Apply</button><button type="button" onClick={clear}>Clear</button></div>
      </form>

      {list.isPending && <p role="status" aria-busy="true">Loading payments…</p>}
      {list.isError && <div role="alert" className="invoice-error"><p>Unable to load payments.</p><button type="button" onClick={() => void list.refetch()}>Retry</button></div>}
      {list.isSuccess && rows.length === 0 && <div className="invoice-empty"><p>No payments match these filters.</p><button type="button" onClick={clear}>Clear filters</button></div>}
      {rows.length > 0 && (
        <table className="invoice-table" aria-label="Payments">
          <thead><tr><th>Date</th><th>Customer</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Invoices</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.is_voided ? 'payment-voided' : undefined}>
                <td data-label="Date">{p.payment_date}</td>
                <td data-label="Customer"><Link to={`/app/customers/${p.customer.id}`}>{p.customer.name}</Link></td>
                <td data-label="Method">{METHOD_LABELS[p.method]}</td>
                <td data-label="Reference">{p.reference_number ?? '—'}</td>
                <td data-label="Amount" className="num">{p.amount}</td>
                <td data-label="Invoices">{p.allocations.map((a, i) => <span key={a.invoice_id}>{i > 0 && ', '}<Link to={`/app/invoices/${a.invoice_id}`}>{a.invoice_number}</Link> ({a.amount})</span>)}</td>
                <td data-label="Status">{p.is_voided ? <span className="payment-badge payment-badge--cancelled" title={p.void_reason ?? ''}>Voided</span> : 'Recorded'}</td>
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
    </section>
  )
}
