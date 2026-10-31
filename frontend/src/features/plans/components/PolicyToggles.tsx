import { POLICY_CHANGE_NOTICE, POLICY_FIELDS } from '../policies'
import type { PlanPolicies } from '../types'

interface Props {
  value: PlanPolicies
  onChange: (next: PlanPolicies) => void
  disabled?: boolean
  showNotice?: boolean
}

/** The four plan policy switches, each with plain-language help text. Emits the full booleans object. */
export function PolicyToggles({ value, onChange, disabled = false, showNotice = true }: Props) {
  return (
    <fieldset className="plans-policies">
      <legend>Policies</legend>
      {showNotice && (
        <p className="plans-notice" role="note">
          {POLICY_CHANGE_NOTICE}
        </p>
      )}
      {POLICY_FIELDS.map(({ key, label, help }) => (
        <div className="plans-toggle" key={key}>
          <label htmlFor={`policy-${key}`}>
            <input
              id={`policy-${key}`}
              type="checkbox"
              checked={value[key]}
              disabled={disabled}
              aria-describedby={`policy-${key}-help`}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />{' '}
            {label}
          </label>
          <small id={`policy-${key}-help`}>{help}</small>
        </div>
      ))}
    </fieldset>
  )
}
