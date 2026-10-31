import { apiRequest } from '../lib/api'

export interface BillingRun { id: string; run_date: string; status: 'running' | 'completed' | 'failed'; subscriptions_scanned: number; invoices_created: number; invoices_skipped: number; errors_count: number }
export interface UpcomingBilling { id: string; number: string; customer_id: string; next_billing_date: string }
export interface BillingRunDetail extends BillingRun { trigger: string; started_at: string; finished_at: string | null; errors: Array<{ id: string; number: string; error: string }> }
export type UpcomingSubscription = UpcomingBilling
export interface BillingRunList { data: BillingRun[]; meta: { page: number; page_size: number; total: number; total_pages: number } }

export function getRuns(page = 1, pageSize = 20): Promise<BillingRunList> { return apiRequest<BillingRunList>(`/billing/runs?page=${page}&page_size=${pageSize}`, { raw: true }) }
export function getRunDetail(id: number): Promise<BillingRunDetail> { return apiRequest<BillingRunDetail>(`/billing/runs/${id}`) }
export function getUpcoming(days = 7): Promise<UpcomingBilling[]> { return apiRequest<UpcomingBilling[]>(`/billing/upcoming?days=${days}`) }
export function triggerRun(asOf?: string): Promise<{ run_id: number; status: string }> { return apiRequest('/billing/runs', { method: 'POST', body: JSON.stringify(asOf ? { as_of: asOf } : {}) }) }
export function createManualInvoice(subscriptionId: number, periodStart: string): Promise<{ id: number }> { return apiRequest('/invoices', { method: 'POST', body: JSON.stringify({ subscription_id: subscriptionId, period_start: periodStart }) }) }

// Compatibility aliases for callers created before the feature was split into hooks.
export const listBillingRuns = getRuns
export const getUpcomingBilling = getUpcoming
export const startBillingRun = triggerRun
