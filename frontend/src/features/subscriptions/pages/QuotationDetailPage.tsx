import { Navigate, useParams } from 'react-router-dom'
import { SubscriptionView } from '../components/SubscriptionView'
import '../subscriptions.css'
export function QuotationDetailPage() {
  const id = Number(useParams().id)
  return Number.isSafeInteger(id) && id > 0 ? <SubscriptionView id={id} variant="quotation" /> : <Navigate to="/app/quotations" replace />
}
