// API client functions for the customers endpoints; import apiRequest from '../lib/api'.
import { apiRequest } from '../lib/api'
import type {
  Customer, CustomerDetail, CustomerListItem, CustomerListParams, CustomerPayload, OwnProfile, OwnProfilePayload, PageMeta,
} from '../features/customers/types'

export interface CustomerListResult {
  data: CustomerListItem[]
  meta: PageMeta
}

export function listCustomers(params: CustomerListParams = {}): Promise<CustomerListResult> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.is_active !== undefined) qs.set('is_active', String(params.is_active))
  if (params.sort) qs.set('sort', params.sort)
  if (params.page) qs.set('page', String(params.page))
  if (params.page_size) qs.set('page_size', String(params.page_size))
  return apiRequest<CustomerListResult>(`/customers?${qs}`, { raw: true })
}

export const getCustomer = (id: number) => apiRequest<CustomerDetail>(`/customers/${id}`)

export const createCustomer = (payload: CustomerPayload) =>
  apiRequest<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) })

export const updateCustomer = (id: number, payload: Partial<CustomerPayload> & { is_active?: boolean }) =>
  apiRequest<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const getOwnProfile = () => apiRequest<OwnProfile>('/me/profile')

export const updateOwnProfile = (payload: Partial<OwnProfilePayload>) =>
  apiRequest<OwnProfile>('/me/profile', { method: 'PATCH', body: JSON.stringify(payload) })
