import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PlanListPage } from '../pages/PlanListPage'

export function PlanListRoute() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.role === 'admin' ? 'admin' : 'staff'

  return <PlanListPage role={role} onNavigate={(path) => navigate(`/app${path}`)} />
}
