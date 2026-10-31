import { useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { CustomerProfileCard } from '../components/CustomerProfileCard'
import { CustomerInvoicesSection, CustomerOutstandingSection, CustomerSubscriptionsSection } from '../components/CustomerDetailSections'
import { useCustomer, useUpdateCustomer } from '../hooks/useCustomers'
import type { Warning } from '../types'
import '../customers.css'

export function CustomerDetailPage() {
  const id = Number(useParams().id)
  if (!Number.isSafeInteger(id) || id <= 0) return <Navigate to="/app/customers" replace />
  return <Detail id={id} />
}

function Detail({ id }: { id: number }) {
  const { user } = useAuth()
  const state = (useLocation().state as { flash?: string; warnings?: Warning[] } | null) ?? {}
  const query = useCustomer(id)
  const update = useUpdateCustomer(id)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; warnings?: Warning[] } | null>(null)

  if (query.isPending) return <p role="status">Loading customer…</p>
  if (query.isError) {
    return (
      <div role="alert" className="customer-error">
        <p>Could not load customer: {query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()}>Retry</button>
        <Link to="/app/customers">Back to customers</Link>
      </div>
    )
  }
  const customer = query.data
  const isAdmin = user?.role === 'admin'

  async function toggleActive() {
    const next = !customer.is_active
    if (!next && !window.confirm(`Deactivate ${customer.name}? Existing subscriptions are not affected.`)) return
    try {
      const result = await update.mutateAsync({ is_active: next })
      setMessage({ kind: 'ok', text: next ? 'Customer reactivated.' : 'Customer deactivated.', ...(result.warnings ? { warnings: result.warnings } : {}) })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update the customer' })
    }
  }

  return (
    <section className="customers-page">
      <header className="customers-header">
        <h1>{customer.name} <span className={`customer-badge${customer.is_active ? '' : ' inactive'}`}>{customer.is_active ? 'Active' : 'Inactive'}</span></h1>
        <div>
          <Link className="customers-link" to="/app/customers">Back to customers</Link>{' '}
          <Link className="customers-link" to={`/app/customers/${id}/edit`}>Edit</Link>{' '}
          {isAdmin && <button type="button" disabled={update.isPending} onClick={() => void toggleActive()}>{customer.is_active ? 'Deactivate' : 'Reactivate'}</button>}
        </div>
      </header>
      {state.flash && !message && <p role="status" className="customer-flash">{state.flash}</p>}
      {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'customer-flash' : 'customer-error'}>{message.text}</p>}
      {(message?.warnings ?? state.warnings)?.map((w) => <p key={w.message} role="note" className="customer-warning">{w.message}</p>)}

      <CustomerProfileCard customer={customer} />
      <CustomerSubscriptionsSection customerId={id} />
      <CustomerInvoicesSection customerId={id} />
      <CustomerOutstandingSection outstanding={customer.outstanding_amount} overdue={customer.overdue_amount} />
    </section>
  )
}
