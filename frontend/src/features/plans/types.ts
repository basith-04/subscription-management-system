// TypeScript types consumed by the plans UI. Mirrors docs/api/api-specification.md §6.

export const BILLING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number]

export const FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** The one `plan.policies` shape shared by every plans endpoint (consumed by F09, F10, F14). */
export interface PlanPolicies {
  auto_close_on_end: boolean
  allow_early_close: boolean
  allow_pause: boolean
  allow_renewal: boolean
}
export type PolicyKey = keyof PlanPolicies

export interface Plan {
  id: number
  name: string
  price: string
  billing_frequency: BillingFrequency
  min_quantity: number
  available_from: string
  available_to: string | null
  is_active: boolean
  notes: string | null
  policies: PlanPolicies
  created_at: string
  updated_at: string
}

export interface PlanListItem extends Plan {
  product_count: number
}

export interface PlanProduct {
  id: number
  product_id: number
  product_name: string | null
  product_is_active: boolean | null
  variant_id: number | null
  variant_label: string | null
  variant_is_active: boolean | null
  default_quantity: number
  unit_price_override: string | null
}

export interface PlanDetail extends Plan {
  products: PlanProduct[]
}

export interface PageMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface PlanListFilters {
  q?: string
  billing_frequency?: BillingFrequency | ''
  is_active?: 'true' | 'false' | ''
  available_on?: string
  page?: number
}

/** Form state: strings for inputs, converted to the API payload on submit. */
export interface PlanFormValues {
  name: string
  price: string
  billing_frequency: BillingFrequency
  min_quantity: string
  available_from: string
  available_to: string
  is_active: boolean
  notes: string
  policies: PlanPolicies
}

export interface PlanPayload {
  name: string
  price: string
  billing_frequency: BillingFrequency
  min_quantity: number
  available_from: string
  available_to: string | null
  is_active: boolean
  notes: string | null
  auto_close_on_end: boolean
  allow_early_close: boolean
  allow_pause: boolean
  allow_renewal: boolean
}

/** Editable product row. `key` is a client-only React key. */
export interface ProductRowDraft {
  key: string
  product_id: number | null
  variant_id: number | null
  default_quantity: string
  unit_price_override: string
  /** Display-only hints loaded from the server for existing rows. */
  product_name?: string | null
  variant_label?: string | null
  product_is_active?: boolean | null
}

export interface PlanProductPayload {
  product_id: number
  variant_id: number | null
  default_quantity: number
  unit_price_override: string | null
}

/** Role-based navigation is injected by the app shell (F00/F01); pages never import a router. */
export type PlanViewerRole = 'admin' | 'staff'
export interface PlanPageNav {
  onNavigate: (path: string) => void
}
