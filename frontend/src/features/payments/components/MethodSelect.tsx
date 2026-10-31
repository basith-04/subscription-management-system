import { METHOD_LABELS } from '../methodLabels'
import { PAYMENT_METHODS, type PaymentMethod } from '../types'

export interface MethodSelectProps {
  value: PaymentMethod | ''
  onChange: (m: PaymentMethod | '') => void
  /** Include an "Any method" option (for filters). */
  allowAny?: boolean
  id?: string
  label?: string
  disabled?: boolean
  invalid?: boolean
}

export function MethodSelect({ value, onChange, allowAny = false, id = 'payment-method', label = 'Method', disabled, invalid }: MethodSelectProps) {
  return (
    <label htmlFor={id}>{label}
      <select id={id} value={value} disabled={disabled} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value as PaymentMethod | '')}>
        <option value="">{allowAny ? 'Any method' : 'Select a method…'}</option>
        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
      </select>
    </label>
  )
}
