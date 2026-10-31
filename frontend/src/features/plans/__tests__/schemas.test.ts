import { describe, expect, it } from 'vitest'
import { isValidDateRange, toPlanPayload, validatePlanForm, validateProductRows } from '../schemas'
import { defaultFormValues } from '../pages/PlanFormPage'
import type { ProductRowDraft } from '../types'

const valid = { ...defaultFormValues('2026-01-01'), name: 'Pro', price: '10.00' }
const row = (over: Partial<ProductRowDraft> = {}): ProductRowDraft => ({
  key: 'k', product_id: 1, variant_id: null, default_quantity: '1', unit_price_override: '', ...over,
})

describe('date validation', () => {
  it('rejects end before start and allows equal/open-ended', () => {
    expect(isValidDateRange('2026-02-01', '2026-01-01')).toBe(false)
    expect(isValidDateRange('2026-02-01', '2026-02-01')).toBe(true)
    expect(isValidDateRange('2026-02-01', '')).toBe(true)
  })

  it('flags an inverted range on available_to', () => {
    const errors = validatePlanForm({ ...valid, available_from: '2026-03-01', available_to: '2026-02-01' })
    expect(errors.available_to).toMatch(/on or after/)
  })

  it('accepts a valid form', () => {
    expect(validatePlanForm(valid)).toEqual({})
  })
})

describe('plan form rules', () => {
  it('requires name, money price and min quantity >= 1', () => {
    const errors = validatePlanForm({ ...valid, name: ' ', price: '1.234', min_quantity: '0' })
    expect(Object.keys(errors).sort()).toEqual(['min_quantity', 'name', 'price'])
  })

  it('maps open-ended end date to null and policies to flat booleans', () => {
    const payload = toPlanPayload({
      ...valid,
      policies: { auto_close_on_end: false, allow_early_close: true, allow_pause: true, allow_renewal: false },
    })
    expect(payload).toMatchObject({
      available_to: null, auto_close_on_end: false, allow_early_close: true, allow_pause: true, allow_renewal: false,
    })
  })
})

describe('product rows', () => {
  it('requires a product, quantity >= 1 and valid money', () => {
    expect(validateProductRows([row({ product_id: null })])[0]).toMatch(/Select a product/)
    expect(validateProductRows([row({ default_quantity: '0' })])[0]).toMatch(/at least 1/)
    expect(validateProductRows([row({ unit_price_override: 'abc' })])[0]).toMatch(/amount/)
  })

  it('detects duplicate product/variant rows including null variants', () => {
    const errors = validateProductRows([row({ key: 'a' }), row({ key: 'b' })])
    expect(errors[1]).toMatch(/already/)
    expect(validateProductRows([row({ key: 'a' }), row({ key: 'b', variant_id: 3 })])).toEqual({})
  })
})
