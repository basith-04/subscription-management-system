import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/api'
import { QuotationForm } from '../components/QuotationForm'
import { useSubscription } from '../hooks/useSubscriptions'
import '../subscriptions.css'

/** Create (/app/quotations/new) and edit (/app/quotations/:id/edit) share one form. */
export function QuotationCreatePage() {
  const raw = useParams().id
  const editing = raw !== undefined
  const id = Number(raw)
  const navigate = useNavigate()
  const existing = useSubscription(editing && Number.isSafeInteger(id) && id > 0 ? id : null)
  if (editing && !(Number.isSafeInteger(id) && id > 0)) return <Navigate to="/app/quotations" replace />
  if (editing && existing.isPending) return <p role="status">Loading…</p>
  if (editing && (existing.isError || !existing.data)) {
    return <p role="alert" className="sub-error">{existing.error instanceof ApiError && existing.error.status === 404 ? 'Quotation not found.' : 'Unable to load this quotation.'} <Link to="/app/quotations">Back</Link></p>
  }
  if (editing && existing.data && !existing.data.can_edit) {
    return <p role="alert" className="sub-error">This record can no longer be edited. <Link to={`/app/quotations/${id}`}>Back to the quotation</Link></p>
  }
  return (
    <section className="sub-page">
      <h1>{editing ? `Edit ${existing.data?.number}` : 'New quotation'}</h1>
      <QuotationForm {...(existing.data ? { initial: existing.data } : {})} onSaved={(s) => navigate(`/app/quotations/${s.id}`)}
        onCancel={() => navigate(editing ? `/app/quotations/${id}` : '/app/quotations')} />
    </section>
  )
}
