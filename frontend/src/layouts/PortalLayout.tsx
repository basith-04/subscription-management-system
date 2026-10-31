import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

export function PortalLayout() {
  const { user } = useAuth()
  return <div className="portal-shell">
    <header className="portal-header"><Link to="/" className="workspace-brand"><span className="workspace-brand-mark">B</span>brightloop</Link><Link to="/portal/profile">My profile</Link></header>
    <main className="portal-content"><p className="portal-eyebrow">Customer space</p><h1>Welcome back, {user?.full_name?.split(' ')[0] ?? 'there'}.</h1><Outlet /></main>
  </div>
}
