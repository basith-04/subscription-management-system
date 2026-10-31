import { describe, it, expect } from 'vitest'
import { normalizeTaxRate, taxRateSchema } from '../src/modules/taxes/taxes.schemas.js'

describe('Tax Rate Validation Unit Tests', () => {
  it('accepts integer and decimal boundaries with three-place normalization', () => {
    for (const [input, expected] of [['5', '5.000'], [18, '18.000'], ['18.5', '18.500'], ['18.75', '18.750'], ['18.125', '18.125'], [0, '0.000'], [100, '100.000']] as const) {
      expect(normalizeTaxRate(input)).toBe(expected)
      expect(taxRateSchema.parse(input)).toBe(expected)
    }
  })
  it('rejects negative, over-100 and over-precision values', () => {
    for (const input of ['-1', -5, '100.001', '105', '18.1234']) {
      expect(() => normalizeTaxRate(input)).toThrow()
      expect(() => taxRateSchema.parse(input)).toThrow()
    }
  })
})
