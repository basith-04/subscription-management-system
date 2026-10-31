import { useState, type FormEvent } from 'react'
import { createPlan, updatePlan } from '../../../api/plans'
import { PolicyToggles } from '../components/PolicyToggles'
import { usePlan } from '../hooks/usePlans'
import { toPlanPayload, validatePlanForm, type FormErrors } from '../schemas'
import {
  BILLING_FREQUENCIES,
  FREQUENCY_LABELS,
  type BillingFrequency,
  type PlanDetail,
  type PlanFormValues,
  type PlanPageNav,
  type PlanViewerRole,
} from '../types'
import '../plans.css'

interface Props extends PlanPageNav {
  role: PlanViewerRole
  /** Omit to create a plan; pass an id to edit. */
  planId?: number
}

export const defaultFormValues = (today: string): PlanFormValues => ({
  name: '',
  price: '',
  billing_frequency: 'monthly',
  min_quantity: '1',
  available_from: today,
  available_to: '',
  is_active: true,
  notes: '',
  policies: { auto_close_on_end: true, allow_early_close: false, allow_pause: false, allow_renewal: true },
})

const fromPlan = (p: PlanDetail): PlanFormValues => ({
  name: p.name,
  price: p.price,
  billing_frequency: p.billing_frequency,
  min_quantity: String(p.min_quantity),
  available_from: p.available_from,
  available_to: p.available_to ?? '',
  is_active: p.is_active,
  notes: p.notes ?? '',
  policies: p.policies,
})

export function PlanFormPage({ role, planId, onNavigate }: Props) {
  if (role !== 'admin') {
    return (
      <p role="alert" className="plans-error">
        Only administrators can create or edit plans.
      </p>
    )
  }
  return planId === undefined ? (
    <CreateForm onNavigate={onNavigate} />
  ) : (
    <EditLoader planId={planId} onNavigate={onNavigate} />
  )
}

function CreateForm({ onNavigate }: PlanPageNav) {
  const [initial] = useState(() => defaultFormValues(new Date().toISOString().slice(0, 10)))
  return <PlanForm onNavigate={onNavigate} initial={initial} />
}

function EditLoader({ planId, onNavigate }: PlanPageNav & { planId: number }) {
  const [state, reload] = usePlan(planId)
  if (state.status === 'loading') return <p role="status">Loading plan…</p>
  if (state.status === 'error') {
    return (
      <div role="alert" className="plans-error">
        <p>Could not load plan: {state.message}</p>
        <button type="button" onClick={reload}>Retry</button>
      </div>
    )
  }
  return <PlanForm onNavigate={onNavigate} planId={planId} initial={fromPlan(state.data)} />
}

function PlanForm({ planId, initial, onNavigate }: PlanPageNav & { planId?: number; initial: PlanFormValues }) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors<keyof PlanFormValues>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => {
    setSaved(false)
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const found = validatePlanForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      const payload = toPlanPayload(values)
      const plan = planId === undefined ? await createPlan(payload) : await updatePlan(planId, payload)
      setSaved(true)
      onNavigate(`/plans/${plan.id}`)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the plan')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof PlanFormValues) =>
    errors[key] ? (
      <span className="plans-error" id={`${key}-error`} role="alert">
        {errors[key]}
      </span>
    ) : null

  return (
    <form className="plans-page plans-form" onSubmit={submit} noValidate>
      <h1>{planId === undefined ? 'New plan' : 'Edit plan'}</h1>

      <label>
        Name
        <input value={values.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
      </label>
      {field('name')}

      <label>
        Price
        <input
          inputMode="decimal"
          value={values.price}
          onChange={(e) => set('price', e.target.value)}
          aria-invalid={!!errors.price}
        />
      </label>
      {field('price')}

      <label>
        Billing frequency
        <select value={values.billing_frequency} onChange={(e) => set('billing_frequency', e.target.value as BillingFrequency)}>
          {BILLING_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      <label>
        Minimum quantity
        <input
          type="number"
          min={1}
          value={values.min_quantity}
          onChange={(e) => set('min_quantity', e.target.value)}
          aria-invalid={!!errors.min_quantity}
        />
      </label>
      {field('min_quantity')}

      <label>
        Available from
        <input
          type="date"
          value={values.available_from}
          onChange={(e) => set('available_from', e.target.value)}
          aria-invalid={!!errors.available_from}
        />
      </label>
      {field('available_from')}

      <label>
        Available to (leave empty for open-ended)
        <input
          type="date"
          value={values.available_to}
          onChange={(e) => set('available_to', e.target.value)}
          aria-invalid={!!errors.available_to}
        />
      </label>
      {field('available_to')}

      <label>
        <input type="checkbox" checked={values.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active
      </label>

      <PolicyToggles value={values.policies} onChange={(p) => set('policies', p)} disabled={saving} />

      <label>
        Notes
        <textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      {serverError && (
        <p role="alert" className="plans-error">
          {serverError}
        </p>
      )}
      {saved && <p role="status">Plan saved.</p>}

      <div className="plans-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save plan'}
        </button>
        <button type="button" disabled={saving} onClick={() => onNavigate(planId ? `/plans/${planId}` : '/plans')}>
          Cancel
        </button>
      </div>
    </form>
  )
}
