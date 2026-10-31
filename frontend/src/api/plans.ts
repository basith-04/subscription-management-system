// API client functions for the plans endpoints; import apiRequest from '../lib/api'.
import { apiRequest } from '../lib/api'
import type {
  PageMeta,
  PlanDetail,
  PlanListFilters,
  PlanListItem,
  PlanPayload,
  PlanProduct,
  PlanProductPayload,
} from '../features/plans/types'

export interface PlanListResult {
  data: PlanListItem[]
  meta: PageMeta
}

export function listPlans(filters: PlanListFilters = {}, page_size = 20): Promise<PlanListResult> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value))
  }
  params.set('page_size', String(page_size))
  return apiRequest<PlanListResult>(`/plans?${params}`, { raw: true })
}

export const getPlan = (id: number) => apiRequest<PlanDetail>(`/plans/${id}`)

export const createPlan = (payload: PlanPayload) =>
  apiRequest<PlanDetail>('/plans', { method: 'POST', body: JSON.stringify(payload) })

export const updatePlan = (id: number, payload: Partial<PlanPayload>) =>
  apiRequest<PlanDetail>(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const replacePlanProducts = (id: number, products: PlanProductPayload[]) =>
  apiRequest<PlanProduct[]>(`/plans/${id}/products`, {
    method: 'PUT',
    body: JSON.stringify({ products }),
  })

export async function deletePlan(id: number): Promise<void> {
  await apiRequest<void>(`/plans/${id}`, { method: 'DELETE' })
}
