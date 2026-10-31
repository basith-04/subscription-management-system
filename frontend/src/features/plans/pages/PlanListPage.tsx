import { useState } from 'react'
import { usePlanList } from '../hooks/usePlans'
import { BILLING_FREQUENCIES, FREQUENCY_LABELS, type PlanListFilters, type PlanPageNav, type PlanViewerRole } from '../types'
import '../plans.css'

interface Props extends PlanPageNav {
  role: PlanViewerRole
}

export function PlanListPage({ role, onNavigate }: Props) {
  const [filters, setFilters] = useState<PlanListFilters>({ page: 1 })
  const [state, reload] = usePlanList(filters)
  const set = (patch: Partial<PlanListFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }))

  return (
    <section className="plans-page">
      <header className="plans-header">
        <h1>Plans</h1>
        {role === 'admin' && (
          <button type="button" onClick={() => onNavigate('/plans/new')}>
            New plan
          </button>
        )}
      </header>

      <form className="plans-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          Search
          <input type="search" value={filters.q ?? ''} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <label>
          Frequency
          <select
            value={filters.billing_frequency ?? ''}
            onChange={(e) => set({ billing_frequency: e.target.value as PlanListFilters['billing_frequency'] })}
          >
            <option value="">All</option>
            {BILLING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.is_active ?? ''}
            onChange={(e) => set({ is_active: e.target.value as PlanListFilters['is_active'] })}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <label>
          Available on
          <input type="date" value={filters.available_on ?? ''} onChange={(e) => set({ available_on: e.target.value })} />
        </label>
      </form>

      {state.status === 'loading' && <p role="status">Loading plans…</p>}
      {state.status === 'error' && (
        <div role="alert" className="plans-error">
          <p>Could not load plans: {state.message}</p>
          <button type="button" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.data.length === 0 && (
        <p className="plans-empty">
          No plans found.{role === 'admin' ? ' Create your first plan to get started.' : ''}
        </p>
      )}
      {state.status === 'ready' && state.data.data.length > 0 && (
        <>
          <table className="plans-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Frequency</th>
                <th>Price</th>
                <th>Available</th>
                <th>Products</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.data.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <button type="button" className="plans-link" onClick={() => onNavigate(`/plans/${plan.id}`)}>
                      {plan.name}
                    </button>
                  </td>
                  <td>{FREQUENCY_LABELS[plan.billing_frequency]}</td>
                  <td>{plan.price}</td>
                  <td>
                    {plan.available_from} → {plan.available_to ?? 'open-ended'}
                  </td>
                  <td>{plan.product_count}</td>
                  <td>{plan.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="plans-pager" aria-label="Pagination">
            <button
              type="button"
              disabled={state.data.meta.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              Previous
            </button>
            <span>
              Page {state.data.meta.page} of {Math.max(1, state.data.meta.total_pages)}
            </span>
            <button
              type="button"
              disabled={state.data.meta.page >= state.data.meta.total_pages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
