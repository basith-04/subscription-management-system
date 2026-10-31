import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { CustomerSelect } from '../../customers'
import { PlanSelect } from '../../plans'
import { getTemplate } from '../../../api/subscriptions'
import { useCreateQuotation, usePaymentTerms, useTaxRules, useTemplates, useUpdateQuotation } from '../hooks/useSubscriptions'
import { todayLocal } from '../dates'
import { isMoney } from '../money'
import type { Subscription, SubscriptionPayload } from '../types'
import { newRow, type LineRow } from '../lineRow'
import { QuotationLinesEditor } from './QuotationLinesEditor'

type FieldErrors = Record<string, string>

const rowsFrom = (s: Subscription): LineRow[] => s.items.map((i) => newRow({
  product_id: i.product_id, variant_id: i.variant_id, quantity: String(i.quantity), unit_price: i.unit_price,
  tax_rule_id: i.tax_rule?.id ?? null, priceEdited: true,
}))

export interface QuotationFormProps {
  /** When set, the form edits this draft/quotation (PATCH); otherwise it creates one. */
  initial?: Subscription
  onSaved: (s: Subscription) => void
  onCancel: () => void
}

export function QuotationForm({ initial, onSaved, onCancel }: QuotationFormProps) {
  const create = useCreateQuotation()
  const update = useUpdateQuotation(initial?.id ?? 0)
  const taxes = useTaxRules()
  const terms = usePaymentTerms()
  const templates = useTemplates()
  const [customerId, setCustomerId] = useState<number | null>(initial?.customer.id ?? null)
  const [templateId, setTemplateId] = useState<number | null>(initial?.template_id ?? null)
  const [planId, setPlanId] = useState<number | null>(initial?.plan.id ?? null)
  const [minQty, setMinQty] = useState(1)
  const [termId, setTermId] = useState<number | null>(initial?.payment_term.id ?? null)
  const [start, setStart] = useState(initial?.start_date ?? todayLocal())
  const [expiry, setExpiry] = useState(initial?.expiry_date ?? '')
  const [rows, setRows] = useState<LineRow[]>(initial ? rowsFrom(initial) : [newRow()])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [banner, setBanner] = useState('')
  const pending = create.isPending || update.isPending
  const [templateState, setTemplateState] = useState<'idle' | 'loading' | 'error'>('idle')

  // Choosing a template pre-fills plan, term and lines; everything stays editable afterwards.
  async function chooseTemplate(id: number | null) {
    setTemplateId(id); setTemplateState(id ? 'loading' : 'idle')
    if (!id) return
    try {
      const t = await getTemplate(id)
      setPlanId(t.plan_id)
      if (t.payment_term_id) setTermId(t.payment_term_id)
      setRows(t.items.map((i) => newRow({
        product_id: i.product_id, variant_id: i.variant_id, quantity: String(i.quantity), tax_rule_id: i.tax_rule_id,
        unit_price: i.unit_price_override ?? '', priceEdited: i.unit_price_override !== null,
      })))
      setTemplateState('idle')
    } catch { setTemplateState('error') }
  }

  function validate(): boolean {
    const e: FieldErrors = {}
    if (!customerId) e.customer_id = 'Select a customer'
    if (!planId && !templateId) e.plan_id = 'Select a plan or a template'
    if (!termId) e.payment_term_id = 'Select a payment term'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) e.start_date = 'Enter a start date'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) e.expiry_date = 'Enter an expiry date'
    else if (expiry < start) e.expiry_date = 'Expiry must be on or after the start date'
    const lineProblems = rows.some((r) => !r.product_id || !/^[1-9]\d{0,9}$/.test(r.quantity.trim()) || (r.unit_price !== '' && !isMoney(r.unit_price)))
    if (lineProblems) e.items = 'Complete every line: product, whole-number quantity and a valid price'
    if (rows.some((r) => /^[1-9]\d*$/.test(r.quantity.trim()) && Number(r.quantity) < minQty)) e.items = `Quantities must be at least ${minQty} for this plan`
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (pending) return // duplicate-submit guard; the server re-validates everything
    setBanner(''); setRowErrors({})
    if (!validate()) return
    const items = rows.map((r) => ({
      product_id: r.product_id as number, quantity: Number(r.quantity),
      ...(r.variant_id ? { variant_id: r.variant_id } : {}), ...(r.unit_price ? { unit_price: r.unit_price } : {}),
      ...(r.tax_rule_id ? { tax_rule_id: r.tax_rule_id } : {}),
    }))
    const payload: SubscriptionPayload = {
      customer_id: customerId as number, plan_id: planId as number, payment_term_id: termId as number,
      start_date: start, expiry_date: expiry, items, ...(templateId && !initial ? { template_id: templateId } : {}),
    }
    try {
      onSaved(initial ? await update.mutateAsync(payload) : await create.mutateAsync(payload))
    } catch (err) {
      if (!(err instanceof ApiError)) return setBanner('Something went wrong. Please try again.')
      const fe: FieldErrors = {}; const re: Record<number, string> = {}
      for (const d of err.details) {
        const m = /^items\.(\d+)\./.exec(d.field)
        if (m) re[Number(m[1])] = d.message
        else fe[d.field] = d.message
      }
      setErrors(fe); setRowErrors(re)
      if (!err.details.length) setBanner(err.message)
      else if (err.code === 'PLAN_NOT_AVAILABLE' || err.code === 'QUANTITY_BELOW_MINIMUM') setBanner(err.message)
    }
  }

  const err = (k: string) => errors[k] && <p role="alert" className="sub-field-error">{errors[k]}</p>
  return (
    <form className="sub-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="sub-field"><span id="customer-label">Customer</span>
        <CustomerSelect label="Customer" value={customerId} initialLabel={initial?.customer.name ?? ''} disabled={pending} onChange={(id) => setCustomerId(id)} />
        {err('customer_id')}</div>

      {!initial && (
        <div className="sub-field"><label htmlFor="template">Template (optional)</label>
          <select id="template" value={templateId ?? ''} disabled={pending || templates.isError} onChange={(e) => void chooseTemplate(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{templates.isError ? 'Templates unavailable' : 'Start from a plan'}</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.plan_name ? ` — ${t.plan_name}` : ''}</option>)}
          </select>
          {templateState === 'loading' && <p role="status" className="sub-muted">Loading template…</p>}
          {templateState === 'error' && <p role="alert" className="sub-field-error">Could not load the template.</p>}
          {err('template_id')}</div>
      )}

      <div className="sub-field">
        <PlanSelect id="plan" label="Plan" value={planId} availableOn={start || undefined} disabled={pending}
          onChange={(id, plan) => { setPlanId(id); setMinQty(plan?.min_quantity ?? 1) }} />
        {err('plan_id')}</div>

      <div className="sub-field"><label htmlFor="payment-term">Payment term</label>
        <select id="payment-term" value={termId ?? ''} disabled={pending} onChange={(e) => setTermId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Select a payment term…</option>
          {terms.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {terms.isError && <p role="alert" className="sub-field-error">Could not load payment terms.</p>}
        {err('payment_term_id')}</div>

      <div className="sub-field"><label htmlFor="start-date">Start date</label>
        <input id="start-date" type="date" value={start} disabled={pending} onChange={(e) => setStart(e.target.value)} />{err('start_date')}</div>
      <div className="sub-field"><label htmlFor="expiry-date">Expiry date</label>
        <input id="expiry-date" type="date" value={expiry} min={start} disabled={pending} onChange={(e) => setExpiry(e.target.value)} />{err('expiry_date')}</div>

      <QuotationLinesEditor rows={rows} onChange={setRows} taxRules={taxes.data ?? []} minQuantity={minQty} disabled={pending} rowErrors={rowErrors} />
      {err('items')}

      {banner && <p role="alert" className="sub-error">{banner}</p>}
      <div className="sub-actions">
        <button type="button" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="submit" className="sub-primary" disabled={pending}>{pending ? 'Saving…' : initial ? 'Save changes' : 'Save quotation'}</button>
      </div>
    </form>
  )
}
