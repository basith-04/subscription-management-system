import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, apiRequest } from '../../lib/api'
import { AuthCard } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { registerSchema, type RegisterInput } from './schemas'
import { getMe, meKey } from './useAuth'

export function RegisterPage() {
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema), defaultValues: { full_name: '', email: '', password: '', company_name: '', phone: '' },
  })
  const password = useWatch({ control, name: 'password' })
  const [message, setMessage] = useState('')
  const client = useQueryClient()
  const navigate = useNavigate()
  const submit = handleSubmit(async (input) => {
    setMessage('')
    try {
      await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(input) })
      await client.fetchQuery({ queryKey: meKey, queryFn: getMe, staleTime: 0 })
      navigate('/portal', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_EXISTS') {
        setError('email', { message: error.message })
      } else if (error instanceof ApiError && error.details.length) {
        for (const detail of error.details) {
          if (['full_name', 'email', 'password', 'company_name', 'phone'].includes(detail.field)) {
            setError(detail.field as keyof RegisterInput, { message: detail.message })
          } else setMessage(error.message)
        }
      } else setMessage(error instanceof Error ? error.message : 'Unable to register.')
    }
  })
  return <AuthCard title="Create an account"><form onSubmit={submit} noValidate>
    <div className="auth-field"><label htmlFor="full_name">Full name</label><input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />{errors.full_name && <p className="field-error" role="alert">{errors.full_name.message}</p>}</div>
    <div className="auth-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />{errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}</div>
    <PasswordField label="Password" registration={register('password')} value={password} error={errors.password?.message} checklist autoComplete="new-password" />
    <div className="auth-field"><label htmlFor="company_name">Company (optional)</label><input id="company_name" autoComplete="organization" {...register('company_name')} />{errors.company_name && <p className="field-error" role="alert">{errors.company_name.message}</p>}</div>
    <div className="auth-field"><label htmlFor="phone">Phone (optional)</label><input id="phone" type="tel" autoComplete="tel" {...register('phone')} />{errors.phone && <p className="field-error" role="alert">{errors.phone.message}</p>}</div>
    {message && <p role="alert" className="field-error">{message}</p>}
    <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</button>
  </form><p>Already registered? <Link to="/login">Sign in</Link></p></AuthCard>
}
