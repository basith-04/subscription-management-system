import { apiRequest } from '../lib/api'
import type { Template, TemplatePayload, TemplateSummary } from '../features/quotation-templates/types'

export interface TemplateListResponse { data: TemplateSummary[]; meta: { page: number; page_size: number; total: number; total_pages: number } }
export function listTemplates(params: { q?: string; is_active?: boolean; page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.is_active !== undefined) query.set('is_active', String(params.is_active))
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  return apiRequest<TemplateListResponse>(`/quotation-templates?${query}`, { raw: true })
}
export const getTemplate = (id: number) => apiRequest<Template>(`/quotation-templates/${id}`)
export const createTemplate = (payload: TemplatePayload) => apiRequest<Template>('/quotation-templates', { method: 'POST', body: JSON.stringify(payload) })
export const updateTemplate = (id: number, payload: Partial<TemplatePayload> & { is_active?: boolean }) => apiRequest<Template>(`/quotation-templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deactivateTemplate = (id: number) => apiRequest<void>(`/quotation-templates/${id}`, { method: 'DELETE' })
