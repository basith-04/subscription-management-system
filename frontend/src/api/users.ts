import { apiRequest } from '../lib/api'
import type { User, PageMeta } from '../features/users/types'

const demoHeaders: Record<string, string> = {}
if (import.meta.env.VITE_DEMO_USER_ID) demoHeaders['X-User-Id'] = String(import.meta.env.VITE_DEMO_USER_ID)
if (import.meta.env.VITE_DEMO_USER_ROLE) demoHeaders['X-User-Role'] = String(import.meta.env.VITE_DEMO_USER_ROLE)

export function listUsers(params: { q?: string; role?: string; is_active?: boolean } = {}): Promise<{ data: User[]; meta: PageMeta }> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.role) qs.set('role', params.role)
  if (params.is_active !== undefined) qs.set('is_active', String(params.is_active))
  return apiRequest<{ data: User[]; meta: PageMeta }>(`/users?${qs.toString()}`, { raw: true, headers: demoHeaders })
}

export function createStaff(input: { full_name: string; email: string; password: string }): Promise<User> {
  return apiRequest<User>('/users/staff', { method: 'POST', body: JSON.stringify(input), headers: demoHeaders })
}

export function updateUser(id: number, input: { full_name?: string; is_active?: boolean }): Promise<User> {
  return apiRequest<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input), headers: demoHeaders })
}
