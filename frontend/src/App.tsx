import { useEffect, useState } from 'react'
import { getHealth, type Health } from './lib/api'
import { ProductListPage, ProductDetailPage, ProductFormPage } from './features/products'
import { StaffListPage } from './features/users'
import './App.css'

type ApiState = { status: 'checking' } | { status: 'online'; health: Health } | { status: 'offline'; message: string }

function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return path
}

export function navigate(to: string): void {
  if (window.location.pathname === to) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}


function Sidebar({ navigate }: { navigate: (p: string) => void }) {
  const role = import.meta.env.VITE_DEMO_USER_ROLE || 'admin' 
  
  return (
    <nav style={{ width: 240, borderRight: '1px solid #e2ded4', padding: '1rem', background: '#f7f6f2', minHeight: '100vh' }}>
      <div style={{ fontWeight: 700, marginBottom: '2rem', color: '#1f6f4a', fontSize: '1.2rem' }}>Brightloop</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        <li><a href="/app/products" onClick={e => { e.preventDefault(); navigate('/app/products') }} style={{display: 'block', padding: '0.5rem', borderRadius: 6, color: '#1c1b18', textDecoration: 'none'}}>Products</a></li>
        {role === 'admin' && (
          <li><a href="/app/users" onClick={e => { e.preventDefault(); navigate('/app/users') }} style={{display: 'block', padding: '0.5rem', borderRadius: 6, color: '#1c1b18', textDecoration: 'none'}}>Staff</a></li>
        )}
      </ul>
    </nav>
  )
}

const renderWithLayout = (Page: React.ReactNode) => (
  <div style={{ display: 'flex' }}>
    <Sidebar navigate={navigate} />
    <div style={{ flex: 1 }}>{Page}</div>
  </div>
)

export default function App() {
  const path = usePath()
  if (path === '/app/products') return renderWithLayout(<ProductListPage navigate={navigate} />)
  if (path === '/app/products/new') return renderWithLayout(<ProductFormPage navigate={navigate} />)
  const m = path.match(/^\/app\/products\/(\d+)$/)
  if (m) return renderWithLayout(<ProductDetailPage id={Number(m[1])} navigate={navigate} />)
  if (path === '/app/users') return renderWithLayout(<StaffListPage navigate={navigate} />)

  return <LandingPage />
}

function LandingPage() {
  const [api, setApi] = useState<ApiState>({ status: 'checking' })
  useEffect(() => {
    let cancelled = false
    getHealth().then((health) => { if (!cancelled) setApi({ status: 'online', health }) }).catch((error: unknown) => {
      if (!cancelled) setApi({ status: 'offline', message: error instanceof Error ? error.message : 'Unable to reach the API' })
    })
    return () => { cancelled = true }
  }, [])

  const capabilities = [
    { title: 'Products & plans', body: 'Catalogue software, variants, billing frequencies, and per-plan policies.' },
    { title: 'Subscriptions', body: 'Quote, confirm, activate, pause, renew, and close the full lifecycle.' },
    { title: 'Billing & invoices', body: 'Generate invoices exactly once per period with taxes and discounts.' },
    { title: 'Payments & reports', body: 'Record payments, track overdue balances, and see recurring revenue.' },
  ]

  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Brightloop home" onClick={(e) => { e.preventDefault(); navigate('/') }}>
          <span className="brand-mark" aria-hidden="true">B</span><span>Brightloop</span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <a href="/app/products" onClick={(e) => { e.preventDefault(); navigate('/app/products') }}>Products</a>
          <a href="#status">Status</a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">Subscription Management System</p>
          <h1>One platform for the whole subscription lifecycle.</h1>
          <p className="lede">Quote, subscribe, bill, collect, and report — without spreadsheets. Built for the Odoo x Make-A-Ton 9.0 Kochi Hackathon 2026.</p>
          <div className="hero-actions">
            <a className="button primary" href="/app/products" onClick={(e) => { e.preventDefault(); navigate('/app/products') }}>Open catalogue</a>
          </div>
        </section>
        <section className="section">
          <h2>What the platform covers</h2>
          <div className="card-grid">
            {capabilities.map((c) => <article className="card" key={c.title}><h3>{c.title}</h3><p>{c.body}</p></article>)}
          </div>
        </section>
        <section id="status" className="section status-section">
          <div><h2>API status</h2><p className="muted">The frontend talks to the Node API through the Vite proxy at <code>/api/v1</code>.</p></div>
          <div className={`status-card status-${api.status}`}>
            <span className="dot" aria-hidden="true" />
            {api.status === 'checking' && <span>Checking the API…</span>}
            {api.status === 'online' && <span>API online · {api.health.service} v{api.health.version}</span>}
            {api.status === 'offline' && <span>API offline · {api.message}</span>}
          </div>
        </section>
      </main>
      <footer className="site-footer"><span>Brightloop Software · Hackathon 2026</span><span>Node + Express API · React + Vite frontend</span></footer>
    </div>
  )
}
