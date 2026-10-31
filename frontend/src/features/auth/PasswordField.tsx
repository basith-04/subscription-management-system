import { useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { passwordRules } from './schemas'

export function PasswordField({ label, registration, value, error, checklist = false, autoComplete = 'current-password' }: {
  label: string; registration: UseFormRegisterReturn; value?: string; error?: string; checklist?: boolean; autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-field"><label htmlFor={registration.name}>{label}</label>
    <div className="password-wrap"><input id={registration.name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} aria-invalid={!!error} {...registration} />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {checklist && <ul className="password-rules" aria-label="Password requirements">{passwordRules.map((rule) => <li key={rule.label}>{rule.valid(value ?? '') ? '✓' : '○'} {rule.label}</li>)}</ul>}
  </div>
}
