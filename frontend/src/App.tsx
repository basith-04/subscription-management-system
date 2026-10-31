import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHealth, type Health } from './lib/api'
import './App.css'

type ApiState = { status: 'checking' } | { status: 'online'; health: Health } | { status: 'offline'; message: string }

export default function App() {
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
        <a className="brand" href="/" aria-label="Brightloop home">
          <span className="brand-mark" aria-hidden="true">B</span><span>Brightloop</span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <Link to="/app/customers">Workspace</Link>
          <a href="#how-it-works">How it works</a>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">Subscription management, made tangible</p>
          <h1>Run the recurring work without the recurring chaos.</h1>
          <p className="lede">Brightloop gives your team a calm place to manage people, plans, catalogue rules and billing essentials.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/register">Start your workspace</Link>
            <Link className="button ghost" to="/login">I already have an account</Link>
          </div>
          <div className="hero-paper-stack" aria-hidden="true"><span>Plans</span><span>Customers</span><span>Invoices</span></div>
        </section>
        <section id="how-it-works" className="section">
          <p className="section-kicker">A connected workspace</p><h2>Everything has a place. Nothing feels buried.</h2>
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
