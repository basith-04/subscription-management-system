import { useEffect, useState } from 'react'
import { listTemplates } from '../../api/quotation-templates'
import type { TemplateSummary } from './types'

/** Returns the selected summary; callers fetch detail only when needed. */
export function TemplateSelect({ value, onChange, disabled = false }: { value: number | null; onChange: (id: number | null, template: TemplateSummary | null) => void; disabled?: boolean }) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<TemplateSummary | null>(null)
  useEffect(() => {
    let active = true
    setTemplates(null)
    setError(false)
    const timeout = window.setTimeout(() => {
      listTemplates({ q: query, is_active: true, page_size: 100 }).then((r) => { if (active) { setTemplates(r.data); setTotal(r.meta.total) } }, () => { if (active) setError(true) })
    }, 250)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [query])
  return <div>
    <label>Search templates <input value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} /></label>
    {error && <span role="alert">Unable to load templates.</span>}
    <select aria-label="Quotation template" value={value ?? ''} disabled={disabled || templates === null || error} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; const item = templates?.find((t) => t.id === id) ?? (selected?.id === id ? selected : null); setSelected(item); onChange(id, item) }}>
    <option value="">{templates === null ? 'Loading templates…' : templates.length ? 'Select a template' : 'No active templates'}</option>
    {selected && selected.id === value && !templates?.some((t) => t.id === selected.id) && <option value={selected.id}>{selected.name} — {selected.plan_name}</option>}
    {templates?.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.plan_name}</option>)}
  </select>
    {templates && total > templates.length && <span>Showing {templates.length} of {total}; refine the search.</span>}
  </div>
}
