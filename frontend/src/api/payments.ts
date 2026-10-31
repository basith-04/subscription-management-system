// API client functions for the payments endpoints; import apiRequest from '../lib/api'.
import { apiRequest } from '../lib/api'
import type { PageMeta, Payment, PaymentListParams, PaymentWithInvoices, RecordPaymentPayload } from '../features/payments/types'

export interface PaymentListResult { data: Payment[]; meta: PageMeta }

export function listPayments(params: PaymentListParams = {}): Promise<PaymentListResult> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  return apiRequest<PaymentListResult>(`/payments?${qs}`, { raw: true })
}
export const getPayment = (id: number) => apiRequest<Payment>(`/payments/${id}`)
export const listInvoicePayments = (invoiceId: number) => apiRequest<Payment[]>(`/invoices/${invoiceId}/payments`)
export const recordPayment = (payload: RecordPaymentPayload) =>
  apiRequest<PaymentWithInvoices>('/payments', { method: 'POST', body: JSON.stringify(payload) })
export const voidPayment = (id: number, reason: string) =>
  apiRequest<PaymentWithInvoices>(`/payments/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
