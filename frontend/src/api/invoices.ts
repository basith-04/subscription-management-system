// API client functions for the invoices endpoints; import apiRequest from '../lib/api'.
import { apiRequest } from '../lib/api'
import type {
  BulkConfirmResult, InvoiceDetail, InvoiceListItem, InvoiceListParams, InvoiceListSummary, PageMeta,
  SendInvoicePayload, UpdateDraftPayload,
} from '../features/invoices/types'

export interface InvoiceListResult {
  data: InvoiceListItem[]
  meta: PageMeta & { summary: InvoiceListSummary }
}

export function listInvoices(params: InvoiceListParams = {}): Promise<InvoiceListResult> {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  return apiRequest<InvoiceListResult>(`/invoices?${qs}`, { raw: true })
}

export const getInvoice = (id: number) => apiRequest<InvoiceDetail>(`/invoices/${id}`)

export const updateInvoiceDraft = (id: number, payload: UpdateDraftPayload) =>
  apiRequest<InvoiceDetail>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const confirmInvoice = (id: number) => apiRequest<InvoiceDetail>(`/invoices/${id}/confirm`, { method: 'POST' })

export const bulkConfirmInvoices = (invoiceIds: number[]) =>
  apiRequest<BulkConfirmResult>('/invoices/bulk-confirm', { method: 'POST', body: JSON.stringify({ invoice_ids: invoiceIds }) })

export const cancelInvoice = (id: number, reason: string) =>
  apiRequest<InvoiceDetail>(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })

export const sendInvoice = (id: number, payload: SendInvoicePayload) =>
  apiRequest<InvoiceDetail & { sent_to: string }>(`/invoices/${id}/send`, { method: 'POST', body: JSON.stringify(payload) })
