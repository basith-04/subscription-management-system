import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CustomerSelect } from '../components/CustomerSelect'
import { useCustomerList } from '../hooks/useCustomers'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { CustomerListParams, CustomerSort } from '../types'
import '../customers.css'

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' }, { value: '-name', label: 'Name (Z–A)' },
  { value: '-created_at', label: 'Newest first' }, { value: 'created_at', label: 'Oldest first' },
]

/** Reads filter state from the URL so lists are shareable and survive reloads / back navigation. */
function paramsFromSearch(sp: URLSearchParams): CustomerListParams {
  const sort = sp.get('sort') as CustomerSort | null
  const active = sp.get('is_active')
  const page = Number.parseInt(sp.get('page') ?? '1', 10)
  return {
    ...(sp.get('q') ? { q: sp.get('q') as string } : {}),
    ...(active === 'true' || active === 'false' ? { is_active: active === 'true' } : {}),
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : 'name',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

export function CustomerListPage() {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const flash = (useLocation().state as { flash?: string } | null)?.flash
  const params = paramsFromSearch(sp)
  const [text, setText] = useState(params.q ?? '')
  const debounced = useDebouncedValue(text.trim(), 300)
  const list = useCustomerList(params)

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setSp(next, { replace: true })
  }

  // Push the debounced search text into the URL (not on every keystroke).
  useEffect(() => {
    if (debounced !== (sp.get('q') ?? '')) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <section className="customers-page">
      <header className="customers-header">
        <h1>Customers</h1>
        <div>
          <CustomerSelect label="Go to customer" placeholder="Go to customer…" activeOnly={false} value={null}
            onChange={(id) => { if (id !== null) navigate(`/app/customers/${id}`) }} />
          <Link to="/app/customers/new" className="customers-link"> New customer</Link>
        </div>
      </header>
      {flash && <p role="status" className="customer-flash">{flash}</p>}

      <form className="customers-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>Search
          <input type="search" value={text} placeholder="Name, email or company" onChange={(e) => setText(e.target.value)} />
        </label>
        <label>Status
          <select value={sp.get('is_active') ?? ''} onChange={(e) => update({ is_active: e.target.value })}>
            <option value="">All</option><option value="true">Active</option><option value="false">Inactive</option>
          </select>
        </label>
        <label>Sort
          <select value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </form>

      {list.isPending && <p role="status">Loading customers…</p>}
      {list.isError && (
        <div role="alert" className="customer-error">
          <p>Could not load customers: {list.error.message}</p>
          <button type="button" onClick={() => void list.refetch()}>Retry</button>
        </div>
      )}
      {list.data && list.data.data.length === 0 && <p className="customer-muted">No customers match</p>}
      {list.data && list.data.data.length > 0 && (
        <>
          <table className="customers-table">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {list.data.data.map((c) => (
                <tr key={c.id}>
                  <td><Link className="customers-link" to={`/app/customers/${c.id}`}>{c.name}</Link></td>
                  <td>{c.company_name ?? '—'}</td><td>{c.email}</td><td>{c.phone ?? '—'}</td>
                  <td>{c.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="customers-pager" aria-label="Pagination">
            <button type="button" disabled={list.data.meta.page <= 1} onClick={() => update({ page: String(list.data.meta.page - 1) }, false)}>Previous</button>
            <span>Page {list.data.meta.page} of {Math.max(1, list.data.meta.total_pages)}</span>
            <button type="button" disabled={list.data.meta.page >= list.data.meta.total_pages} onClick={() => update({ page: String(list.data.meta.page + 1) }, false)}>Next</button>
          </nav>
        </>
      )}
    </section>
  )
}
