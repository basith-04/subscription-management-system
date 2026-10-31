import { useEffect, useState } from 'react'
import { listTemplates } from '../../api/quotation-templates'
import type { TemplateSummary } from './types'

/** Returns the selected summary; callers fetch detail only when needed. */
export function TemplateSelect({ value, onChange, disabled = false }: { value: number | null; onChange: (id: number | null, template: TemplateSummary | null) => void; disabled?: boolean }) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { let active = true; listTemplates({ is_active: true, page_size: 100 }).then((r) => { if (active) setTemplates(r.data) }, () => { if (active) setError(true) }); return () => { active = false } }, [])
  if (error) return <span role="alert">Unable to load templates.</span>
  return <select aria-label="Quotation template" value={value ?? ''} disabled={disabled || templates === null} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; onChange(id, templates?.find((t) => t.id === id) ?? null) }}>
    <option value="">{templates === null ? 'Loading templates…' : templates.length ? 'Select a template' : 'No active templates'}</option>
    {templates?.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.plan_name}</option>)}
  </select>
}
