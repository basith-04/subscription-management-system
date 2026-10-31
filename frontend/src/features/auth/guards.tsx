import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, type AuthUser } from './useAuth'

export function RequireAuth() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <main>Checking session…</main>
  if (error) return <main role="alert">Unable to check your session. Please try again.</main>
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: AuthUser['role'][] }) {
  const { user, loading } = useAuth()
  if (loading) return <main>Checking session…</main>
  if (!user || !roles.includes(user.role)) return <main role="alert">403 — You do not have permission to access this page.</main>
  return <Outlet />
}
