import { describe, expect, it } from 'vitest'
import { assertPlanAndQuantities } from './subscriptions.validation.js'

const plan = { is_active: true, available_from: '2026-01-01', available_to: '2026-12-31', min_quantity: 3 }

describe('F09 plan and quantity validation', () => {
  it('accepts inclusive availability boundaries and quantities at the minimum', () => {
    expect(() => assertPlanAndQuantities(plan, '2026-01-01', [{ quantity: 3 }])).not.toThrow()
    expect(() => assertPlanAndQuantities(plan, '2026-12-31', [{ quantity: 3 }, { quantity: 4 }])).not.toThrow()
    expect(() => assertPlanAndQuantities(plan, '2026-06-01', [])).not.toThrow()
  })

  it('uses F07 availability validation for inactive and unavailable plans', () => {
    for (const [candidate, date] of [
      [{ ...plan, is_active: false }, '2026-06-01'],
      [plan, '2025-12-31'],
      [plan, '2027-01-01'],
    ] as const) {
      expect(() => assertPlanAndQuantities(candidate, date, [{ quantity: 3 }])).toThrowError(
        expect.objectContaining({ status: 422, code: 'PLAN_NOT_AVAILABLE' }),
      )
    }
  })

  it('identifies the line below the current plan minimum', () => {
    expect(() => assertPlanAndQuantities(plan, '2026-06-01', [{ quantity: 3 }, { quantity: 2 }])).toThrowError(
      expect.objectContaining({ status: 422, code: 'QUANTITY_BELOW_MINIMUM', details: [expect.objectContaining({ field: 'items.1.quantity' })] }),
    )
  })

  it('rejects malformed quantities rather than allowing a bypass', () => {
    for (const quantity of [0, -1, 2.5, Number.NaN, 2_147_483_648]) {
      expect(() => assertPlanAndQuantities(plan, '2026-06-01', [{ quantity }])).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' }),
      )
    }
  })
})
