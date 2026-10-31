import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { deactivateTemplate, listTemplates, type TemplateListResponse } from '../../api/quotation-templates'
import { useAuth } from '../auth/useAuth'

export function TemplateListPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [q, setQ] = useState('')
  const [active, setActive] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<TemplateListResponse | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState((location.state as { success?: string } | null)?.success ?? '')
  useEffect(() => {
    let current = true
    setResult(null); setError('')
    listTemplates({ q, ...(active ? { is_active: active === 'true' } : {}), page }).then((r) => { if (current) setResult(r) }, (e: unknown) => { if (current) setError(e instanceof Error ? e.message : 'Unable to load templates') })
    return () => { current = false }
  }, [q, active, page, revision])
  async function deactivate(id: number) {
    if (!window.confirm('Deactivate this template? Existing quotations are not changed.')) return
    try { await deactivateTemplate(id); setNotice('Template deactivated.'); setRevision((n) => n + 1) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to deactivate') }
  }
  return <main><h1>Quotation templates</h1>
    {user?.role === 'admin' && <Link to="/app/quotation-templates/new">New template</Link>}
    <div><label>Search <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></label>{' '}
    <label>Status <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1) }}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {!result && !error && <p>Loading templates…</p>}
    {result?.data.length === 0 && <p>No templates found.</p>}
    {result && result.data.length > 0 && <table><thead><tr><th>Name</th><th>Plan</th><th>Status</th><th>Actions</th></tr></thead><tbody>{result.data.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.plan_name}</td><td>{t.is_active ? 'Active' : 'Inactive'}</td><td><Link to={`/app/quotation-templates/${t.id}`}>{user?.role === 'admin' ? 'Edit' : 'View'}</Link>{' '}{user?.role === 'admin' && t.is_active && <button onClick={() => void deactivate(t.id)}>Deactivate</button>}</td></tr>)}</tbody></table>}
    {result && <div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button> Page {page} of {Math.max(1, result.meta.total_pages)} <button disabled={page >= result.meta.total_pages} onClick={() => setPage(page + 1)}>Next</button></div>}
  </main>
}
