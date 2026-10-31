import { useEffect, useState } from 'react'
import { listPlans } from '../../../api/plans'
import { FREQUENCY_LABELS, type Plan } from '../types'

interface Props {
  id?: string
  label?: string
  value: number | null
  onChange: (planId: number | null, plan?: Plan) => void
  /** When set, only plans sellable on this date (YYYY-MM-DD) are offered. */
  availableOn?: string
  disabled?: boolean
}

/** Picker of active plans, optionally restricted to those available on a date. Shared with F08/F09. */
export function PlanSelect({ id, label = 'Plan', value, onChange, availableOn, disabled }: Props) {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPlans(null)
    setFailed(false)
    listPlans({ is_active: 'true', ...(availableOn ? { available_on: availableOn } : {}) }, 100).then(
      (res) => !cancelled && setPlans(res.data),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [availableOn])

  if (failed) return <span role="alert">Could not load plans</span>
  return (
    <select
      id={id}
      aria-label={label}
      value={value ?? ''}
      disabled={disabled || plans === null}
      onChange={(e) => {
        const next = e.target.value ? Number(e.target.value) : null
        onChange(next, plans?.find((p) => p.id === next))
      }}
    >
      <option value="">{plans === null ? 'Loading plans…' : plans.length ? 'Select a plan' : 'No plans available'}</option>
      {plans?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({FREQUENCY_LABELS[p.billing_frequency]})
        </option>
      ))}
    </select>
  )
}
