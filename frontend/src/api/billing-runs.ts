import { apiRequest } from '../lib/api'

export interface BillingRun {
  id: number
  trigger: string
  run_date: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed'
  subscriptions_scanned: number
  invoices_created: number
  invoices_skipped: number
  errors_count: number
}

export interface BillingRunDetail extends BillingRun {
  errors: Array<{ id: number; number: string; error: string }>
}

export interface UpcomingSubscription {
  id: number
  number: string
  next_billing_date: string
  customer_id: number
}

export async function getRuns(page = 1, pageSize = 20) {
  return apiRequest<{ data: BillingRun[]; meta: any }>(`/billing/runs?page=${page}&page_size=${pageSize}`)
}

export async function getRunDetail(id: number) {
  return apiRequest<BillingRunDetail>(`/billing/runs/${id}`)
}

export async function triggerRun(asOf?: string) {
  return apiRequest<{ run_id: number; status: string }>('/billing/runs', {
    method: 'POST',
    body: JSON.stringify({ as_of: asOf }),
  })
}

export async function getUpcoming(days = 7) {
  return apiRequest<UpcomingSubscription[]>(`/billing/upcoming?days=${days}`)
}

export async function createManualInvoice(subscriptionId: number, periodStart: string) {
  return apiRequest<{ id: number }>('/invoices', {
    method: 'POST',
    body: JSON.stringify({ subscription_id: subscriptionId, period_start: periodStart }),
  })
}
