import { Navigate, useParams } from 'react-router-dom'
import { SubscriptionView } from '../components/SubscriptionView'
import '../subscriptions.css'
export function SubscriptionDetailPage() {
  const id = Number(useParams().id)
  return Number.isSafeInteger(id) && id > 0 ? <SubscriptionView id={id} variant="subscription" /> : <Navigate to="/app/subscriptions" replace />
}
