// Form validation for plans (UX only — mirrors backend format rules; the backend stays authoritative).
import type { PlanFormValues, PlanPayload, PlanProductPayload, ProductRowDraft } from './types'

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type FormErrors<K extends string = string> = Partial<Record<K, string>>

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** `available_to` may be empty (open-ended) but must not precede `available_from`. */
export function isValidDateRange(from: string, to: string): boolean {
  if (!from || !to) return true
  return to >= from
}

export function validatePlanForm(values: PlanFormValues): FormErrors<keyof PlanFormValues> {
  const errors: FormErrors<keyof PlanFormValues> = {}
  if (!values.name.trim()) errors.name = 'Name is required'
  if (!MONEY_RE.test(values.price.trim())) errors.price = 'Enter an amount like 499.00 (max 2 decimals)'
  const qty = Number(values.min_quantity)
  if (!/^\d+$/.test(values.min_quantity.trim()) || qty < 1) {
    errors.min_quantity = 'Minimum quantity must be a whole number of at least 1'
  }
  if (!isValidDate(values.available_from)) errors.available_from = 'Choose a valid start date'
  if (values.available_to && !isValidDate(values.available_to)) {
    errors.available_to = 'Choose a valid end date'
  } else if (!isValidDateRange(values.available_from, values.available_to)) {
    errors.available_to = 'End date must be on or after the start date'
  }
  return errors
}

export function toPlanPayload(values: PlanFormValues): PlanPayload {
  return {
    name: values.name.trim(),
    price: values.price.trim(),
    billing_frequency: values.billing_frequency,
    min_quantity: Number(values.min_quantity),
    available_from: values.available_from,
    available_to: values.available_to || null,
    is_active: values.is_active,
    notes: values.notes.trim() || null,
    auto_close_on_end: values.policies.auto_close_on_end,
    allow_early_close: values.policies.allow_early_close,
    allow_pause: values.policies.allow_pause,
    allow_renewal: values.policies.allow_renewal,
  }
}

/** Per-row validation; returns a map of row index → message. */
export function validateProductRows(rows: ProductRowDraft[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const seen = new Set<string>()
  rows.forEach((row, i) => {
    if (row.product_id === null) {
      errors[i] = 'Select a product'
      return
    }
    if (!/^\d+$/.test(row.default_quantity.trim()) || Number(row.default_quantity) < 1) {
      errors[i] = 'Default quantity must be a whole number of at least 1'
      return
    }
    if (row.unit_price_override.trim() && !MONEY_RE.test(row.unit_price_override.trim())) {
      errors[i] = 'Price override must be an amount like 10.50'
      return
    }
    const key = `${row.product_id}:${row.variant_id ?? 'none'}`
    if (seen.has(key)) errors[i] = 'This product/variant is already in the list'
    seen.add(key)
  })
  return errors
}

export function toProductPayload(rows: ProductRowDraft[]): PlanProductPayload[] {
  return rows.map((row) => ({
    product_id: row.product_id as number,
    variant_id: row.variant_id,
    default_quantity: Number(row.default_quantity),
    unit_price_override: row.unit_price_override.trim() || null,
  }))
}
