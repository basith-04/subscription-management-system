export interface TemplateItem {
  id: number; product_id: number; product_name: string; product_is_active: boolean; sales_price: string
  variant_id: number | null; variant_label: string | null; variant_is_active: boolean | null
  quantity: number; unit_price_override: string | null; effective_price: string
  tax_rule_id: number | null; tax_rule_name: string | null; tax_rule_is_active: boolean | null; sort_order: number
}
export interface TemplateSummary {
  id: number; name: string; plan_id: number; plan_name: string; validity_days: number
  payment_term_id: number | null; is_active: boolean; created_at: string; updated_at: string
}
export interface Template extends TemplateSummary {
  plan_is_active: boolean; plan_min_quantity: number; payment_term_name: string | null
  payment_term_is_active: boolean | null; notes: string | null; items: TemplateItem[]
}
export interface TemplatePayload {
  name: string; plan_id: number; validity_days: number; payment_term_id: number | null; notes: string | null
  items: Array<{ product_id: number; variant_id: number | null; quantity: number; unit_price_override: string | null; tax_rule_id: number | null }>
}
