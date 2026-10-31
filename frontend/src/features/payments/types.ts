// TypeScript types consumed by the payments UI (mirror docs/api/api-specification.md §12). Money is a string.
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }

export interface PaymentAllocation { invoice_id: number; invoice_number: string; amount: string }

export interface Payment {
  id: number
  customer: { id: number; name: string }
  method: PaymentMethod
  amount: string
  payment_date: string
  note: string | null
  reference_number: string | null
  source: string
  is_voided: boolean
  voided_at: string | null
  void_reason: string | null
  recorded_by: number | null
  created_at: string
  allocations: PaymentAllocation[]
}

export interface AffectedInvoice {
  id: number
  number: string
  status: 'draft' | 'confirmed' | 'paid' | 'cancelled'
  payment_state: string
  amount_paid: string
  amount_due: string
}
export type PaymentWithInvoices = Payment & { invoices: AffectedInvoice[] }

export interface RecordPaymentPayload {
  method: PaymentMethod
  amount: string
  payment_date: string
  note?: string
  reference_number?: string
  allocations: Array<{ invoice_id: number; amount: string }>
  confirm_duplicate?: boolean
}

export interface PaymentListParams {
  method?: PaymentMethod
  customer_id?: number
  invoice_id?: number
  date_from?: string
  date_to?: string
  voided?: boolean
  q?: string
  sort?: string
  page?: number
  page_size?: number
}
