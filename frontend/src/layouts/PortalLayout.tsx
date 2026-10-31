import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { meKey, useAuth } from '../features/auth/useAuth'
import '../features/portal/portal.css'

const LINKS = [
  { to: '/portal', label: 'Home', end: true }, { to: '/portal/subscriptions', label: 'Subscriptions' },
  { to: '/portal/invoices', label: 'Invoices' }, { to: '/portal/profile', label: 'Profile' }, { to: '/portal/change-password', label: 'Change password' },
]

/** Customer-facing chrome (brand and shell styles from styles/global.css), mobile-first. Hidden when printing. */
export function PortalLayout() {
  const { user } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  async function logout() {
    setPending(true)
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      await client.cancelQueries(); client.clear(); client.setQueryData(meKey, null)
      navigate('/login', { replace: true })
    } finally { setPending(false) }
  }
  return (
    <div className="portal-shell">
      <header className="portal-header no-print">
        <Link to="/" className="workspace-brand"><span className="workspace-brand-mark">B</span>brightloop</Link>
        <span className="portal-user">{user?.full_name}</span>
        <nav aria-label="Portal" className="portal-nav">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          <button type="button" onClick={() => void logout()} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>
        </nav>
      </header>
      <main className="portal-content">
        <p className="portal-eyebrow no-print">Customer space</p>
        <Outlet />
      </main>
    </div>
  )
}
