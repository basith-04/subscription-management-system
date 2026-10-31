// TypeScript types consumed by the customers UI. Mirrors docs/api/api-specification.md §4.

export interface CustomerAddress {
  line1: string | null
  line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

export interface Warning {
  field: string
  message: string
}

/** Subset returned by `GET /customers` and used by CustomerSelect. */
export interface CustomerListItem {
  id: number
  name: string
  company_name: string | null
  email: string
  phone: string | null
  is_active: boolean
}

export interface Customer extends CustomerListItem {
  address: CustomerAddress
  tax_id: string | null
  notes: string | null
  has_portal_login: boolean
  warnings?: Warning[]
}

/** `GET /customers/:id`. Summary fields stay null until F09 / F13 provide them. */
export interface CustomerDetail extends Customer {
  subscriptions_count: number | null
  outstanding_amount: string | null
  overdue_amount: string | null
}

/** `/me/profile`: no notes, no active flag. */
export type OwnProfile = Omit<Customer, 'notes' | 'is_active' | 'has_portal_login' | 'warnings'>

export interface PageMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export type CustomerSort = 'name' | '-name' | 'created_at' | '-created_at'

export interface CustomerListParams {
  q?: string
  is_active?: boolean
  sort?: CustomerSort
  page?: number
  page_size?: number
}

/** Customer fields as sent to `POST/PATCH /customers`. */
export interface CustomerPayload {
  name: string
  company_name: string | null
  email: string
  phone: string | null
  address: Partial<Record<keyof CustomerAddress, string | null>>
  tax_id: string | null
  notes: string | null
}

/** Customer fields as sent to `PATCH /me/profile`. */
export type OwnProfilePayload = Pick<CustomerPayload, 'name' | 'company_name' | 'phone' | 'address'>
