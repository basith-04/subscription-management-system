import { apiRequest } from '../api.js'

export interface TaxRule {
  id: string
  name: string
  rate: string // e.g. "18.000"
  is_active: boolean
  created_at: string
  updated_at: string
}

export function formatTaxRate(rate: string | number): string {
  const num = typeof rate === 'number' ? rate : Number.parseFloat(rate)
  if (Number.isNaN(num)) return `${rate} %`
  return `${num.toFixed(3)} %`
}

export async function getTaxes(
  params?: { is_active?: boolean },
  roleHeader?: string,
): Promise<TaxRule[]> {
  const query = new URLSearchParams()
  if (params?.is_active !== undefined) {
    query.set('is_active', String(params.is_active))
  }
  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<TaxRule[]>(`/taxes${queryString}`, {
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function getTax(id: string, roleHeader?: string): Promise<TaxRule> {
  return apiRequest<TaxRule>(`/taxes/${id}`, {
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function createTax(
  payload: { name: string; rate: string; is_active?: boolean },
  roleHeader?: string,
): Promise<TaxRule> {
  return apiRequest<TaxRule>('/taxes', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function updateTax(
  id: string,
  payload: { name?: string; rate?: string; is_active?: boolean },
  roleHeader?: string,
): Promise<TaxRule> {
  return apiRequest<TaxRule>(`/taxes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function deleteTax(id: string, roleHeader?: string): Promise<void> {
  await apiRequest<void>(`/taxes/${id}`, {
    method: 'DELETE',
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}
