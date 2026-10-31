import { useEffect, useState } from 'react'
import { getHealth, type Health } from './lib/api.js'
import { AuthProvider, useAuth, type Role } from './lib/auth-context.js'
import { TaxListPage, TaxSelect } from './features/taxes/index.js'
import { PaymentTermListPage, PaymentTermSelect } from './features/payment-terms/index.js'
import './App.css'

type ApiState =
  | { status: 'checking' }
  | { status: 'online'; health: Health }
  | { status: 'offline'; message: string }

type ActiveTab = 'overview' | 'taxes' | 'payment-terms' | 'pickers-demo'

function MainContent() {
  const { role, setRole } = useAuth()
  const [activeTab, setActiveTab] = useState<ActiveTab>('taxes')
  const [api, setApi] = useState<ApiState>({ status: 'checking' })

  // Pickers demo state
  const [selectedTaxId, setSelectedTaxId] = useState<string>('')
  const [selectedTermId, setSelectedTermId] = useState<string>('')

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
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault()
            setActiveTab('overview')
          }}
          aria-label="Brightloop home"
        >
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span>Brightloop</span>
        </a>

        <nav className="nav" aria-label="Main navigation">
          <button
            type="button"
            className={`nav-button ${activeTab === 'taxes' ? 'active' : ''}`}
            onClick={() => setActiveTab('taxes')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'taxes' ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === 'taxes' ? 700 : 500,
              cursor: 'pointer',
              padding: '8px 12px',
              fontSize: '0.95rem',
            }}
          >
            Taxes
          </button>
          <button
            type="button"
            className={`nav-button ${activeTab === 'payment-terms' ? 'active' : ''}`}
            onClick={() => setActiveTab('payment-terms')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'payment-terms' ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === 'payment-terms' ? 700 : 500,
              cursor: 'pointer',
              padding: '8px 12px',
              fontSize: '0.95rem',
            }}
          >
            Payment Terms
          </button>
          <button
            type="button"
            className={`nav-button ${activeTab === 'pickers-demo' ? 'active' : ''}`}
            onClick={() => setActiveTab('pickers-demo')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'pickers-demo' ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === 'pickers-demo' ? 700 : 500,
              cursor: 'pointer',
              padding: '8px 12px',
              fontSize: '0.95rem',
            }}
          >
            Reusable Pickers
          </button>
          <button
            type="button"
            className={`nav-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'overview' ? '#2563eb' : '#4b5563',
              fontWeight: activeTab === 'overview' ? 700 : 500,
              cursor: 'pointer',
              padding: '8px 12px',
              fontSize: '0.95rem',
            }}
          >
            System Status
          </button>
        </nav>

        {/* Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="role-select" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' }}>
            Current Role:
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.85rem',
              fontWeight: 600,
              backgroundColor: role === 'admin' ? '#eff6ff' : '#f9fafb',
              color: role === 'admin' ? '#1d4ed8' : '#374151',
              cursor: 'pointer',
            }}
          >
            <option value="admin">Admin (Full Access)</option>
            <option value="staff">Staff (Read-Only)</option>
          </select>
        </div>
      </header>

      <main style={{ padding: '24px 0', minHeight: '80vh' }}>
        {activeTab === 'taxes' && <TaxListPage />}

        {activeTab === 'payment-terms' && <PaymentTermListPage />}

        {activeTab === 'pickers-demo' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.75rem', color: '#111827' }}>
              Reusable Selection Components
            </h1>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
              Exported pickers for F08 (Quotation Templates), F09 (Quotations & Subscriptions), and F12 (Recurring Billing Engine).
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '24px',
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem' }}>1. TaxSelect Component</h3>
                <p style={{ margin: '0 0 10px 0', color: '#6b7280', fontSize: '0.875rem' }}>
                  Filters active tax rules only; displays tax rate in <code>18.000 %</code> format.
                </p>
                <div style={{ maxWidth: '400px' }}>
                  <TaxSelect
                    value={selectedTaxId}
                    onChange={(id) => setSelectedTaxId(id)}
                    roleHeader={role}
                  />
                </div>
                <small style={{ color: '#4b5563', marginTop: '6px', display: 'block' }}>
                  Selected Tax ID: <strong>{selectedTaxId || '(none)'}</strong>
                </small>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 }} />

              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem' }}>2. PaymentTermSelect Component</h3>
                <p style={{ margin: '0 0 10px 0', color: '#6b7280', fontSize: '0.875rem' }}>
                  Filters active payment terms only; displays term name and due days.
                </p>
                <div style={{ maxWidth: '400px' }}>
                  <PaymentTermSelect
                    value={selectedTermId}
                    onChange={(id) => setSelectedTermId(id)}
                    roleHeader={role}
                  />
                </div>
                <small style={{ color: '#4b5563', marginTop: '6px', display: 'block' }}>
                  Selected Payment Term ID: <strong>{selectedTermId || '(none)'}</strong>
                </small>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
            <h2>API & System Status</h2>
            <div
              style={{
                marginTop: '16px',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
              }}
            >
              {api.status === 'checking' && <p>Checking API connection...</p>}
              {api.status === 'online' && (
                <div>
                  <p style={{ color: '#15803d', fontWeight: 600 }}>
                    API Online ({api.health.service} v{api.health.version})
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    Taxes and Payment Terms endpoints (/api/v1/taxes, /api/v1/payment-terms) are active.
                  </p>
                </div>
              )}
              {api.status === 'offline' && (
                <p style={{ color: '#dc2626' }}>API Offline: {api.message}</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  )
}

export default App
