// Statuses and enums for customers (values match DB CHECK constraints).

/** List sort fields. `created_at` orders by `id`: `customers` has no timestamp column (F00 baseline). */
export const CUSTOMER_SORT_FIELDS = ['name', 'created_at'] as const

export const CUSTOMER_AUDIT = {
  create: 'customer.create',
  update: 'customer.update',
  deactivate: 'customer.deactivate',
  reactivate: 'customer.reactivate',
  profileUpdate: 'customer.profile_update',
} as const

export const ADDRESS_KEYS = ['line1', 'line2', 'city', 'state', 'postal_code', 'country'] as const
export type AddressKey = (typeof ADDRESS_KEYS)[number]

/** API address key → customers column. */
export const ADDRESS_COLUMNS: Record<AddressKey, string> = {
  line1: 'address_line1',
  line2: 'address_line2',
  city: 'city',
  state: 'state',
  postal_code: 'postal_code',
  country: 'country',
}
