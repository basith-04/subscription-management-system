import { describe, it, expect } from 'vitest'
import { computeEffectivePrice } from '../src/lib/pricing.js'
import { ApiError } from '../src/middleware/error-handler.js'

describe('computeEffectivePrice', () => {
  it('returns sales_price with 2 decimals when no variant', () => {
    expect(computeEffectivePrice({ sales_price: '1000.00' })).toBe('1000.00')
  })
  it('adds positive adjustment (Odoo example)', () => {
    expect(computeEffectivePrice({ sales_price: '1000.00' }, { price_adjustment: '560.00' })).toBe('1560.00')
  })
  it('handles negative adjustment', () => {
    expect(computeEffectivePrice({ sales_price: '1000.00' }, { price_adjustment: '-500.00' })).toBe('500.00')
  })
  it('rejects negative effective price', () => {
    expect(() => computeEffectivePrice({ sales_price: '1000.00' }, { price_adjustment: '-1500.00' })).toThrow(ApiError)
  })
  it('is decimal-safe: 0.10 + 0.20 = 0.30', () => {
    expect(computeEffectivePrice({ sales_price: '0.10' }, { price_adjustment: '0.20' })).toBe('0.30')
  })
  it('is decimal-safe at NUMERIC(12,2) boundary', () => {
    expect(computeEffectivePrice({ sales_price: '9999999.99' }, { price_adjustment: '0.01' })).toBe('10000000.00')
  })
})
