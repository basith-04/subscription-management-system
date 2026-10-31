import { apiRequest } from '../api.js'

export interface PaymentTerm {
  id: string
  name: string
  due_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getPaymentTerms(
  params?: { is_active?: boolean },
  roleHeader?: string,
): Promise<PaymentTerm[]> {
  const query = new URLSearchParams()
  if (params?.is_active !== undefined) {
    query.set('is_active', String(params.is_active))
  }
  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<PaymentTerm[]>(`/payment-terms${queryString}`, {
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function getPaymentTerm(id: string, roleHeader?: string): Promise<PaymentTerm> {
  return apiRequest<PaymentTerm>(`/payment-terms/${id}`, {
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function createPaymentTerm(
  payload: { name: string; due_days: number; is_active?: boolean },
  roleHeader?: string,
): Promise<PaymentTerm> {
  return apiRequest<PaymentTerm>('/payment-terms', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}

export async function updatePaymentTerm(
  id: string,
  payload: { name?: string; due_days?: number; is_active?: boolean },
  roleHeader?: string,
): Promise<PaymentTerm> {
  return apiRequest<PaymentTerm>(`/payment-terms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: roleHeader ? { 'x-user-role': roleHeader } : {},
  })
}
