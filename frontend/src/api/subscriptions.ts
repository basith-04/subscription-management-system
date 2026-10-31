// API client for quotations (/quotations) and subscriptions (/subscriptions); both use the same backend service.
import { apiRequest } from '../lib/api'
import type {
  HistoryEntry, ListParams, PageMeta, PaymentTermOption, Subscription, SubscriptionListItem, SubscriptionPayload,
  TaxRuleOption, TemplateDetail, TemplateOption,
} from '../features/subscriptions/types'

export interface ListResult { data: SubscriptionListItem[]; meta: PageMeta }

function query(params: ListParams): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  return qs.toString()
}

export const listQuotations = (p: ListParams = {}) => apiRequest<ListResult>(`/quotations?${query(p)}`, { raw: true })
export const listSubscriptions = (p: ListParams = {}) => apiRequest<ListResult>(`/subscriptions?${query(p)}`, { raw: true })
export const getSubscription = (id: number) => apiRequest<Subscription>(`/subscriptions/${id}`)
export const getHistory = (id: number) => apiRequest<HistoryEntry[]>(`/subscriptions/${id}/history`)

export const createQuotation = (payload: SubscriptionPayload) =>
  apiRequest<Subscription>('/quotations', { method: 'POST', body: JSON.stringify(payload) })
export const updateQuotation = (id: number, payload: Partial<SubscriptionPayload>) =>
  apiRequest<Subscription>(`/quotations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const issueQuotation = (id: number, validUntil?: string) =>
  apiRequest<Subscription>(`/quotations/${id}/issue`, { method: 'POST', body: JSON.stringify(validUntil ? { valid_until: validUntil } : {}) })
export const confirmQuotation = (id: number) => apiRequest<Subscription>(`/quotations/${id}/confirm`, { method: 'POST' })
export const cancelQuotation = (id: number, reason?: string) =>
  apiRequest<Subscription>(`/quotations/${id}/cancel`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) })

// Lookups owned by other features, called through their documented endpoints with the real session cookie.
export const listTaxRules = async () =>
  (await apiRequest<Array<{ id: number | string; name: string; rate: string; is_active?: boolean }>>('/taxes'))
    .filter((t) => t.is_active !== false).map<TaxRuleOption>((t) => ({ id: Number(t.id), name: t.name, rate: String(t.rate) }))
export const listPaymentTerms = async () =>
  (await apiRequest<Array<{ id: number | string; name: string; is_active?: boolean }>>('/payment-terms'))
    .filter((t) => t.is_active !== false).map<PaymentTermOption>((t) => ({ id: Number(t.id), name: t.name }))
// F08 contract: GET /quotation-templates (A,S) and GET /quotation-templates/:id with items.
export const listTemplates = () => apiRequest<TemplateOption[]>('/quotation-templates?is_active=true')
export const getTemplate = (id: number) => apiRequest<TemplateDetail>(`/quotation-templates/${id}`)
