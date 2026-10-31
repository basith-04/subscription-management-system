import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createTemplate, getTemplate, updateTemplate } from '../../api/quotation-templates'
import { LineItemsEditor, type LineItemDraft } from '../../components/LineItemsEditor'
import { ApiError } from '../../lib/api'
import { useAuth } from '../auth/useAuth'
import { PaymentTermSelect } from '../payment-terms'
import { PlanSelect, type Plan } from '../plans'
import type { Template, TemplatePayload } from './types'
import { templatePayloadSchema } from './schemas'

export function TemplateFormPage() {
  const { id: param } = useParams()
  const id = param ? Number(param) : null
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.role !== 'admin'
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<number | null>(null)
  const [minimum, setMinimum] = useState<number | undefined>()
  const [validity, setValidity] = useState('30')
  const [term, setTerm] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItemDraft[]>([])
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [referenceWarning, setReferenceWarning] = useState('')
  const [original, setOriginal] = useState<Template | null>(null)
  const [itemsDirty, setItemsDirty] = useState(false)
  useEffect(() => {
    if (!id) return
    let current = true
    getTemplate(id).then((t) => { if (!current) return; setOriginal(t); setName(t.name); setPlan(t.plan_id); setMinimum(t.plan_min_quantity); setValidity(String(t.validity_days)); setTerm(t.payment_term_id); setNotes(t.notes ?? ''); if (!t.plan_is_active || t.payment_term_is_active === false) setReferenceWarning('The selected plan or payment term is inactive.'); setItems(t.items.map((i) => ({ key: String(i.id), product_id: i.product_id, variant_id: i.variant_id, quantity: String(i.quantity), unit_price: i.unit_price_override ?? i.effective_price, base_price: i.sales_price, overridden: i.unit_price_override !== null, tax_rule_id: i.tax_rule_id, product_is_active: i.product_is_active, variant_is_active: i.variant_is_active, tax_rule_is_active: i.tax_rule_is_active }))); setLoading(false) }, (e: unknown) => { if (current) { setError(e instanceof Error ? e.message : 'Unable to load template'); setLoading(false) } })
    return () => { current = false }
  }, [id])
  useEffect(() => { if (!dirty) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler) }, [dirty])
  const changed = () => setDirty(true)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setFields({})
    if (!plan || items.length === 0 || items.some((item) => !item.product_id)) { setError('Select a plan and add at least one product line.'); return }
    const payload: TemplatePayload = { name, plan_id: plan, validity_days: Number(validity), payment_term_id: term, notes: notes || null, items: items.map((item) => ({ product_id: item.product_id!, variant_id: item.variant_id, quantity: Number(item.quantity), unit_price_override: item.overridden ? item.unit_price : null, tax_rule_id: item.tax_rule_id })) }
    const validation = templatePayloadSchema.safeParse(payload)
    if (!validation.success) { setError('Check the highlighted fields.'); setFields(Object.fromEntries(validation.error.issues.map((issue) => [issue.path.join('.'), issue.message]))); return }
    setSaving(true)
    try {
      if (id && original) {
        const data = validation.data
        const patch: Partial<TemplatePayload> = {}
        if (data.name !== original.name) patch.name = data.name
        if (data.plan_id !== original.plan_id) patch.plan_id = data.plan_id
        if (data.validity_days !== original.validity_days) patch.validity_days = data.validity_days
        if (data.payment_term_id !== original.payment_term_id) patch.payment_term_id = data.payment_term_id
        if (data.notes !== original.notes) patch.notes = data.notes
        if (itemsDirty) patch.items = data.items
        if (Object.keys(patch).length) await updateTemplate(id, patch)
      } else await createTemplate(validation.data)
      setDirty(false); navigate('/app/quotation-templates', { state: { success: 'Template saved.' } })
    }
    catch (e) { if (e instanceof ApiError) { setError(e.message); setFields(Object.fromEntries(e.details.map((d) => [d.field, d.message]))) } else setError('Unable to save template.') }
    finally { setSaving(false) }
  }
  if (loading) return <p>Loading template…</p>
  return <main><h1>{id ? readOnly ? 'View template' : 'Edit template' : 'New template'}</h1>
    {error && <p role="alert">{error}</p>}
    {referenceWarning && <p role="status">{referenceWarning}</p>}
    <form onSubmit={(e) => void submit(e)}><fieldset disabled={readOnly || saving} style={{ display: 'grid', gap: '1rem' }}>
      <label>Name <input required maxLength={120} value={name} onChange={(e) => { setName(e.target.value); changed() }} /> {fields.name && <span role="alert">{fields.name}</span>}</label>
      <label>Plan <PlanSelect value={plan} onChange={(value, selected?: Plan) => { setPlan(value); setMinimum(selected?.min_quantity); changed() }} /> {fields.plan_id && <span role="alert">{fields.plan_id}</span>}</label>
      <label>Validity days <input required type="number" min="1" max="2147483647" value={validity} onChange={(e) => { setValidity(e.target.value); changed() }} /> {fields.validity_days && <span role="alert">{fields.validity_days}</span>}</label>
      <label>Payment term <PaymentTermSelect value={term?.toString() ?? ''} onChange={(value) => { setTerm(value ? Number(value) : null); changed() }} /> {fields.payment_term_id && <span role="alert">{fields.payment_term_id}</span>}</label>
      <label>Notes <textarea maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); changed() }} /></label>
      <LineItemsEditor value={items} onChange={(value) => { setItems(value); setItemsDirty(true); changed() }} disabled={readOnly || saving} minimumQuantity={minimum} errors={fields} showTotals />
      {!readOnly && <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>}
    </fieldset></form>
    <Link to="/app/quotation-templates" onClick={(e) => { if (dirty && !window.confirm('Discard unsaved changes?')) e.preventDefault() }}>Back to templates</Link>
  </main>
}
