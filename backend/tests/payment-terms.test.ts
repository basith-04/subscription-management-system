import { describe, it, expect } from 'vitest'
import { dueDaysSchema } from '../src/modules/payment-terms/payment-terms.schemas.js'

describe('Payment Term Validation Unit Tests', () => {
  it('accepts zero and positive integers', () => {
    for (const value of [0, 15, 30]) expect(dueDaysSchema.parse(value)).toBe(value)
  })
  it('rejects negative and fractional values', () => {
    for (const value of [-5, 15.5]) expect(() => dueDaysSchema.parse(value)).toThrow()
  })
})
