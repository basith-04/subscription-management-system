import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { AuthProvider } from '../lib/auth-context'

const navigation = [
  { to: '/app/customers', label: 'Customers', mark: '01' },
  { to: '/app/products', label: 'Catalogue', mark: '02' },
  { to: '/app/plans', label: 'Plans', mark: '03' },
  { to: '/app/taxes', label: 'Taxes', mark: '04' },
  { to: '/app/payment-terms', label: 'Payment terms', mark: '05' },
]

function Workspace() {
  const { user } = useAuth()
  const items = user?.role === 'admin' ? [...navigation, { to: '/app/users', label: 'Team', mark: '06' }] : navigation

  return <div className="workspace-shell">
    <aside className="workspace-rail">
      <NavLink className="workspace-brand" to="/app/customers"><span className="workspace-brand-mark">B</span><span>brightloop</span></NavLink>
      <p className="workspace-kicker">Back office</p>
      <nav className="workspace-nav" aria-label="Back office navigation">
        {items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'is-active' : ''}><span>{item.mark}</span>{item.label}</NavLink>)}
      </nav>
      <div className="workspace-note"><span className="paper-dot" />Live workspace</div>
    </aside>
    <div className="workspace-canvas">
      <header className="workspace-topbar"><p>Subscription operations, kept human.</p><div className="workspace-user"><span>{user?.full_name?.slice(0, 1) ?? 'B'}</span><strong>{user?.full_name ?? 'Brightloop team'}</strong></div></header>
      <main className="workspace-content"><Outlet /></main>
    </div>
  </div>
}

export function BackOfficeLayout() { return <AuthProvider><Workspace /></AuthProvider> }
