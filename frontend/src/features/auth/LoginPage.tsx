import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, apiRequest } from '../../lib/api'
import { AuthCard } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { loginSchema, type LoginInput } from './schemas'
import { getMe, meKey, safeReturnPath } from './useAuth'

export function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })
  const [message, setMessage] = useState('')
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const submit = handleSubmit(async (input) => {
    setMessage('')
    try {
      await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(input) })
      const user = await client.fetchQuery({ queryKey: meKey, queryFn: getMe, staleTime: 0 })
      const from: unknown = (location.state as { from?: unknown } | null)?.from
      navigate(safeReturnPath(from, user.role), { replace: true })
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 429
        ? `Too many attempts. Try again${error.retryAfter ? ` in ${error.retryAfter} seconds` : ' later'}.`
        : error instanceof Error ? error.message : 'Unable to sign in.')
    }
  })
  return <AuthCard title="Sign in"><form onSubmit={submit} noValidate>
    <div className="auth-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />{errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}</div>
    <PasswordField label="Password" registration={register('password')} error={errors.password?.message} />
    {message && <p role="alert" className="field-error">{message}</p>}
    <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
  </form><p>New here? <Link to="/register">Create an account</Link></p></AuthCard>
}
