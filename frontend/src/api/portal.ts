// API client for the customer portal (/me/*) plus the reused F09/F10 action endpoints. No customer id is ever sent:
// the server resolves the customer from the session.
import { apiRequest } from '../lib/api'
import type {
  CustomerActionName, MyInvoiceDetail, MyInvoiceListItem, MySubscription, MySubscriptionDetail, PageMeta, PortalSummary,
} from '../features/portal/types'

const qs = (p: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') q.set(k, String(v))
  return q.toString()
}

export const listMySubscriptions = (p: { status?: string; page?: number; page_size?: number } = {}) =>
  apiRequest<{ data: MySubscription[]; meta: PageMeta }>(`/me/subscriptions?${qs(p)}`, { raw: true })
export const getMySubscription = (id: number) => apiRequest<MySubscriptionDetail>(`/me/subscriptions/${id}`)
export const listMyInvoices = (p: { status?: string; payment_state?: string; page?: number; page_size?: number } = {}) =>
  apiRequest<{ data: MyInvoiceListItem[]; meta: PageMeta & { summary: PortalSummary } }>(`/me/invoices?${qs(p)}`, { raw: true })
export const getMyInvoice = (id: number) => apiRequest<MyInvoiceDetail>(`/me/invoices/${id}`)

/** Reused action endpoints: F09 confirm, F10 pause / resume / renew / close (role C, own only — enforced by the server). */
export const performAction = (action: CustomerActionName, id: number) =>
  apiRequest<unknown>(action === 'confirm' ? `/quotations/${id}/confirm` : `/subscriptions/${id}/${action}`, { method: 'POST' })
