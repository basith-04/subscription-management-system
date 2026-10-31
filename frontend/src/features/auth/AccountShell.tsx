import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../lib/api'
import { meKey, useAuth } from './useAuth'
import './auth.css'

export function AccountShell({ area }: { area: 'portal' | 'app' }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const warnings = (location.state as { warnings?: Array<{ field: string; message: string }> } | null)?.warnings
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function logout() {
    setPending(true)
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      await client.cancelQueries()
      client.clear()
      client.setQueryData(meKey, null)
      navigate('/login', { replace: true })
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally { setPending(false) }
  }
  return <div className="auth-page">
    <section className="auth-card">
      <h1>{area === 'portal' ? 'Customer portal' : 'Back office'}</h1>
      <p>Welcome, {user?.full_name}.</p>
      <p>Signed in as {user?.role}.</p>
      {area === 'app' && <nav aria-label="Back office">
        <Link to="/app/customers">Customers</Link>
        <Link to="/app/products">Products</Link>
      </nav>}
      {area === 'portal' && <p><Link to="/portal/profile">My profile</Link></p>}
      {warnings?.map((warning) => <p key={`${warning.field}:${warning.message}`} role="status">{warning.message}</p>)}
      {error && <p role="alert">{error}</p>}
      <button className="auth-submit" disabled={pending} onClick={() => void logout()}>{pending ? 'Signing out…' : 'Sign out'}</button>
    </section>
    <Outlet />
  </div>
}
