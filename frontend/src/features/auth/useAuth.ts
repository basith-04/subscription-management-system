import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiRequest } from '../../lib/api'

export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'staff' | 'customer'
  customer_id: number | null
}

export const meKey = ['auth', 'me'] as const
export function getMe(): Promise<AuthUser> { return apiRequest<AuthUser>('/auth/me') }

export function useAuth() {
  const client = useQueryClient()
  useEffect(() => {
    const clear = () => { client.clear() }
    window.addEventListener('brightloop:unauthenticated', clear)
    return () => window.removeEventListener('brightloop:unauthenticated', clear)
  }, [client])
  const query = useQuery({ queryKey: meKey, queryFn: getMe, retry: false, staleTime: 5_000 })
  return {
    user: query.data ?? null,
    loading: query.isPending || query.isFetching,
    error: query.error instanceof ApiError && query.error.status === 401 ? null : query.error,
  }
}

export function roleHome(role: AuthUser['role']): string {
  return role === 'customer' ? '/portal' : '/app'
}

/** Only internal role-appropriate destinations can be restored after login. */
export function safeReturnPath(value: unknown, role: AuthUser['role']): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 32)) return roleHome(role)
  const prefix = roleHome(role)
  return value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`) ? value : prefix
}
