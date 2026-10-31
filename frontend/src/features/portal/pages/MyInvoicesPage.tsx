import { Link, useSearchParams } from 'react-router-dom'
import { Money, PaymentStateBadge } from '../../invoices'
import { OutstandingSummary } from '../components/OutstandingSummary'
import { QueryState } from '../components/QueryState'
import { useMyInvoices } from '../hooks/usePortal'

const STATES = ['not_due', 'outstanding', 'partially_paid', 'overdue', 'paid', 'cancelled'] as const
const STATUSES = ['confirmed', 'paid', 'cancelled'] as const

export function MyInvoicesPage() {
  const [sp, setSp] = useSearchParams()
  const state = STATES.find((s) => s === sp.get('payment_state'))
  const status = STATUSES.find((s) => s === sp.get('status'))
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const q = useMyInvoices({ ...(state ? { payment_state: state } : {}), ...(status ? { status } : {}), page })
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    setSp(next, { replace: true })
  }
  const meta = q.data?.meta
  return (
    <div className="portal-stack">
      <h1>My invoices</h1>
      {meta && <OutstandingSummary summary={meta.summary} />}
      <div className="portal-filters">
        <label className="portal-field">Payment status
          <select value={state ?? ''} onChange={(e) => set({ payment_state: e.target.value || null, page: null })}>
            <option value="">All</option>{STATES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
        <label className="portal-field">Invoice status
          <select value={status ?? ''} onChange={(e) => set({ status: e.target.value || null, page: null })}>
            <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      <QueryState query={q} what="invoices">
        {q.data?.data.length === 0
          ? <p className="portal-empty">{state || status ? 'No invoices match these filters.' : 'You have no invoices yet.'}</p>
          : (
            <table className="portal-table" aria-label="Invoices">
              <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Due amount</th></tr></thead>
              <tbody>
                {q.data?.data.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Invoice"><Link to={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
                    <td data-label="Issued">{i.issue_date}</td><td data-label="Due">{i.due_date}</td>
                    <td data-label="Status"><PaymentStateBadge state={i.payment_state} /></td>
                    <td data-label="Total" className="num"><Money value={i.total} /></td>
                    <td data-label="Paid" className="num"><Money value={i.amount_paid} /></td>
                    <td data-label="Due amount" className="num"><Money value={i.amount_due} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
