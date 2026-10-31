// TypeScript types consumed by the invoices UI (mirror docs/api/api-specification.md §11). Money is always a string.
export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled'
export type PaymentState = 'draft' | 'not_due' | 'outstanding' | 'partially_paid' | 'overdue' | 'paid' | 'cancelled'

export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }

export interface InvoiceListSummary { count: number; total: string; amount_paid: string; amount_due: string }

export interface InvoiceListItem {
  id: number
  number: string
  customer: { id: number; name: string }
  subscription_id: number
  status: InvoiceStatus
  payment_state: PaymentState
  issue_date: string
  due_date: string
  total: string
  amount_paid: string
  amount_due: string
  sent_at: string | null
}

export interface InvoiceItem {
  id: number
  description: string
  quantity: number
  unit_price: string
  line_subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_name: string | null
  tax_rate: string
  tax_amount: string
  line_total: string
}

export interface InvoiceTaxDetail { tax_name: string; tax_rate: string; taxable_amount: string; tax_amount: string }

export interface InvoiceDetail {
  id: number
  number: string
  status: InvoiceStatus
  payment_state: PaymentState
  subscription: { id: number; number: string | null }
  billing_run_id: number | null
  /** Snapshot stored on the invoice; never follows later customer edits. */
  customer: { id: number; name: string; email: string; tax_id: string | null; billing_address: Record<string, unknown> | null }
  period_start: string
  period_end: string
  issue_date: string
  due_date: string
  payment_term: string
  notes: string | null
  items: InvoiceItem[]
  tax_details: InvoiceTaxDetail[]
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  amount_due: string
  confirmed_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  sent_at: string | null
  created_at: string
  can_edit: boolean
  can_confirm: boolean
  can_cancel: boolean
  can_send: boolean
}

export interface InvoiceListParams {
  status?: InvoiceStatus
  payment_state?: string
  customer_id?: number
  subscription_id?: number
  issue_from?: string
  issue_to?: string
  due_from?: string
  due_to?: string
  q?: string
  min_total?: string
  max_total?: string
  sort?: string
  page?: number
  page_size?: number
}

export interface BulkConfirmResult { confirmed: number[]; failed: Array<{ id: number; code: string }> }
export interface SendInvoicePayload { to?: string; message?: string }
export interface UpdateDraftPayload { due_date?: string; notes?: string | null; remove_item_ids?: number[] }
