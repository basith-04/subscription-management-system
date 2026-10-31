import { useEffect } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApiError } from '../../../lib/api'
import {
  customerFormSchema, profileFormSchema, serverFieldToFormField,
  type CustomerFormValues, type ProfileFormValues,
} from '../schemas'

export const DIRTY_MESSAGE = 'You have unsaved changes. Leave without saving?'

type Mode = 'staff' | 'profile'
type Values = CustomerFormValues | ProfileFormValues

interface Props {
  /** `staff`: all fields. `profile`: only name, company, phone, address (email shown read-only elsewhere). */
  mode: Mode
  defaultValues: CustomerFormValues
  submitLabel: string
  onSubmit: (values: CustomerFormValues) => Promise<void>
  onCancel?: () => void
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', company_name: 'Company', email: 'Email', phone: 'Phone',
  address_line1: 'Address line 1', address_line2: 'Address line 2', address_city: 'City', address_state: 'State',
  address_postal_code: 'Postal code', address_country: 'Country', tax_id: 'Tax ID', notes: 'Notes',
}

/** Shared create/edit/profile form. Validates inline, maps server 422 details to fields, and warns on leaving while dirty. */
export function CustomerForm({ mode, defaultValues, submitLabel, onSubmit, onCancel }: Props) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(mode === 'staff' ? customerFormSchema : profileFormSchema) as never,
    defaultValues,
  })

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values as CustomerFormValues)
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const d of error.details) setError(serverFieldToFormField(d.field) as FieldPath<Values>, { message: d.message })
      } else {
        setError('root', { message: error instanceof Error ? error.message : 'Could not save' })
      }
    }
  })

  const field = (name: keyof CustomerFormValues, opts: { type?: string; multiline?: boolean; readOnly?: boolean } = {}) => {
    if (mode === 'profile' && (name === 'email' || name === 'tax_id' || name === 'notes')) return null
    const err = (errors as Record<string, { message?: string } | undefined>)[name]?.message
    const id = `customer-${name}`
    const props = { id, 'aria-invalid': !!err, 'aria-describedby': err ? `${id}-error` : undefined, ...register(name as FieldPath<Values>) }
    return (
      <div className="customer-field">
        <label htmlFor={id}>{FIELD_LABELS[name]}</label>
        {opts.multiline ? <textarea rows={3} {...props} /> : <input type={opts.type ?? 'text'} {...props} />}
        {err && <span id={`${id}-error`} className="field-error" role="alert">{err}</span>}
      </div>
    )
  }

  return (
    <form className="customer-form" onSubmit={(e) => void submit(e)} noValidate>
      {field('name')}
      {field('company_name')}
      {field('email', { type: 'email' })}
      {field('phone', { type: 'tel' })}
      <fieldset>
        <legend>Address</legend>
        {field('address_line1')}
        {field('address_line2')}
        {field('address_city')}
        {field('address_state')}
        {field('address_postal_code')}
        {field('address_country')}
      </fieldset>
      {field('tax_id')}
      {field('notes', { multiline: true })}
      {errors.root?.message && <p role="alert" className="field-error">{errors.root.message}</p>}
      <div className="customer-actions">
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : submitLabel}</button>
        {onCancel && (
          <button type="button" disabled={isSubmitting} onClick={() => { if (!isDirty || window.confirm(DIRTY_MESSAGE)) onCancel() }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
