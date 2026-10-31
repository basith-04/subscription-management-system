// TypeScript types consumed by the quotations / subscriptions UI (mirror docs/api/api-specification.md §7.2 and §8).
// Money is always a string.
export type SubscriptionStatus = 'draft' | 'quotation' | 'confirmed' | 'active' | 'closed'

export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }

export interface SubscriptionLine {
  id: number
  product_id: number
  variant_id: number | null
  description: string
  quantity: number
  unit_price: string
  tax_rule: { id: number; name: string; rate: string } | null
  line_amount: string
  tax_amount: string
  line_total: string
  sort_order: number
}

export interface Totals { subtotal: string; estimated_tax: string; total: string }

export interface Subscription {
  id: number
  number: string
  status: SubscriptionStatus
  display_status: string
  customer: { id: number; name: string; email: string }
  plan: { id: number; name: string; billing_frequency: string }
  template_id: number | null
  payment_term: { id: number; name: string }
  start_date: string
  expiry_date: string
  days_to_expiry: number
  quotation_valid_until: string | null
  next_billing_date: string | null
  auto_renew: boolean
  confirmed_at: string | null
  closed_at: string | null
  closed_reason: string | null
  items: SubscriptionLine[]
  totals: Totals
  can_edit: boolean
  can_issue: boolean
  can_confirm: boolean
  can_cancel: boolean
  created_at: string
  updated_at: string
}

export interface SubscriptionListItem {
  id: number
  number: string
  customer: { id: number; name: string }
  plan: { id: number; name: string }
  status: SubscriptionStatus
  display_status: string
  start_date: string
  expiry_date: string
  quotation_valid_until: string | null
  next_billing_date: string | null
  total_per_period: string
}

export interface HistoryEntry {
  id: number
  action: string
  actor: { id: number; name: string | null } | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export interface ItemPayload { product_id: number; variant_id?: number | null; quantity: number; unit_price?: string; tax_rule_id?: number | null }

export interface SubscriptionPayload {
  customer_id: number
  template_id?: number
  plan_id?: number
  start_date: string
  expiry_date: string
  payment_term_id?: number
  items?: ItemPayload[]
}

export interface ListParams {
  status?: SubscriptionStatus
  customer_id?: number
  plan_id?: number
  q?: string
  expiry_from?: string
  expiry_to?: string
  valid_until_to?: string
  sort?: string
  page?: number
  page_size?: number
}

export interface TaxRuleOption { id: number; name: string; rate: string }
export interface PaymentTermOption { id: number; name: string }
export interface TemplateOption { id: number; name: string; plan_id: number; plan_name?: string }
export interface TemplateDetail extends TemplateOption {
  validity_days: number
  payment_term_id: number | null
  items: Array<{ product_id: number; variant_id: number | null; quantity: number; unit_price_override: string | null; tax_rule_id: number | null }>
}
