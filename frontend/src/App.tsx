import { useEffect, useState } from 'react'
import { getHealth, type Health } from './lib/api'
import './App.css'

type ApiState =
  | { status: 'checking' }
  | { status: 'online'; health: Health }
  | { status: 'offline'; message: string }

const capabilities = [
  {
    title: 'Products & plans',
    body: 'Catalogue software, variants, billing frequencies, and per-plan policies.',
  },
  {
    title: 'Subscriptions',
    body: 'Quote, confirm, activate, pause, renew, and close the full lifecycle.',
  },
  {
    title: 'Billing & invoices',
    body: 'Generate invoices exactly once per period with taxes and discounts.',
  },
  {
    title: 'Payments & reports',
    body: 'Record payments, track overdue balances, and see recurring revenue.',
  },
]

function App() {
  const [api, setApi] = useState<ApiState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false

    getHealth()
      .then((health) => {
        if (!cancelled) setApi({ status: 'online', health })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Unable to reach the API'
          setApi({ status: 'offline', message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Brightloop home">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span>Brightloop</span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#status">Status</a>
          <a href="/docs/api/api-specification.md">API docs</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Subscription Management System</p>
          <h1>One platform for the whole subscription lifecycle.</h1>
          <p className="lede">
            Quote, subscribe, bill, collect, and report — without spreadsheets.
            Built for the Odoo x Make-A-Ton 9.0 Kochi Hackathon 2026.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#capabilities">
              Explore capabilities
            </a>
            <a className="button ghost" href="/docs/README.md">
              Read the docs
            </a>
          </div>
        </section>

        <section id="capabilities" className="section">
          <h2>What the platform covers</h2>
          <div className="card-grid">
            {capabilities.map((item) => (
              <article className="card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="status" className="section status-section">
          <div>
            <h2>API status</h2>
            <p className="muted">
              The frontend talks to the Go API through the Vite proxy at{' '}
              <code>/api/v1</code>.
            </p>
          </div>
          <div className={`status-card status-${api.status}`}>
            {api.status === 'checking' && (
              <>
                <span className="dot" aria-hidden="true" />
                <span>Checking the API…</span>
              </>
            )}
            {api.status === 'online' && (
              <>
                <span className="dot" aria-hidden="true" />
                <span>
                  API online · {api.health.service} v{api.health.version}
                </span>
              </>
            )}
            {api.status === 'offline' && (
              <>
                <span className="dot" aria-hidden="true" />
                <span>API offline · {api.message}</span>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>Brightloop Software · Hackathon 2026</span>
        <span>Node + Express API · React + Vite frontend</span>
      </footer>
    </div>
  )
}

export default App
