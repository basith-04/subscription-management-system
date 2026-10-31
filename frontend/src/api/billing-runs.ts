import { apiRequest } from '../lib/api'

export interface BillingRun { id: string; run_date: string; status: 'running' | 'completed' | 'failed'; subscriptions_scanned: number; invoices_created: number; invoices_skipped: number; errors_count: number }
export interface UpcomingBilling { id: string; number: string; customer_id: string; next_billing_date: string }
export interface BillingRunList { data: BillingRun[]; meta: { page: number; total_pages: number } }

export function listBillingRuns(): Promise<BillingRunList> { return apiRequest<BillingRunList>('/billing/runs', { raw: true }) }
export function getUpcomingBilling(days = 7): Promise<UpcomingBilling[]> { return apiRequest<UpcomingBilling[]>(`/billing/upcoming?days=${days}`) }
export function startBillingRun(): Promise<{ run_id: number; status: string }> { return apiRequest('/billing/runs', { method: 'POST', body: '{}' }) }
