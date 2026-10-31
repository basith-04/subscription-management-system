// Types for the customer portal (mirror GET /me/* responses). Money is a string.
export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }

export interface CustomerActions { can_confirm: boolean; can_pause: boolean; can_resume: boolean; can_renew: boolean; can_close: boolean }

export interface MySubscription extends CustomerActions {
  id: number
  number: string
  status: 'quotation' | 'confirmed' | 'active' | 'closed'
  display_status: string
  plan: { id: number; name: string; billing_frequency: string }
  start_date: string
  expiry_date: string
  days_to_expiry: number
  quotation_valid_until: string | null
  next_billing_date: string | null
}

export interface MySubscriptionDetail extends MySubscription {
  payment_term: string
  paused: boolean
  auto_renew: boolean
  items: Array<{ description: string; quantity: number; unit_price: string; tax: { name: string; rate: string } | null; line_amount: string; tax_amount: string; line_total: string }>
  totals: { subtotal: string; estimated_tax: string; total: string }
}

export type MyPaymentState = 'not_due' | 'outstanding' | 'partially_paid' | 'overdue' | 'paid' | 'cancelled'

export interface MyInvoiceListItem {
  id: number
  number: string
  status: 'confirmed' | 'paid' | 'cancelled'
  payment_state: MyPaymentState
  issue_date: string
  due_date: string
  total: string
  amount_paid: string
  amount_due: string
}

export interface PortalSummary { outstanding_amount: string; overdue_amount: string }

export interface MyPayment { id: number; method: string; payment_date: string; amount: string; reference_number: string | null; is_voided: boolean }

export interface MyInvoiceDetail {
  id: number
  number: string
  status: 'confirmed' | 'paid' | 'cancelled'
  payment_state: MyPaymentState
  subscription: { id: number; number: string | null }
  customer: { id: number; name: string; email: string; tax_id: string | null; billing_address: Record<string, unknown> | null }
  period_start: string
  period_end: string
  issue_date: string
  due_date: string
  payment_term: string
  notes: string | null
  items: Array<{
    id: number; description: string; quantity: number; unit_price: string; line_subtotal: string; discount_amount: string
    taxable_amount: string; tax_name: string | null; tax_rate: string; tax_amount: string; line_total: string
  }>
  tax_details: Array<{ tax_name: string; tax_rate: string; taxable_amount: string; tax_amount: string }>
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  amount_due: string
  payments: MyPayment[]
}

export type CustomerActionName = 'confirm' | 'pause' | 'resume' | 'renew' | 'close'
