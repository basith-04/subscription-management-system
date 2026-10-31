import { describe, expect, it } from 'vitest'
import { assertCreationStartDate, assertPlanAndQuantities } from './subscriptions.validation.js'

const plan = { is_active: true, available_from: '2026-01-01', available_to: '2026-12-31', min_quantity: 3 }

describe('F09 creation start dates', () => {
  it('allows administrators to backdate and staff to use today or later', () => {
    expect(() => assertCreationStartDate('admin', '2026-10-31', '2026-11-01')).not.toThrow()
    expect(() => assertCreationStartDate('staff', '2026-11-01', '2026-11-01')).not.toThrow()
    expect(() => assertCreationStartDate('staff', '2026-11-02', '2026-11-01')).not.toThrow()
  })

  it('rejects staff backdating and customer creation', () => {
    expect(() => assertCreationStartDate('staff', '2026-10-31', '2026-11-01')).toThrowError(
      expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' }),
    )
    expect(() => assertCreationStartDate('customer', '2026-11-01', '2026-11-01')).toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    )
  })

  it('fails closed for invalid input or clock dates', () => {
    expect(() => assertCreationStartDate('staff', '2026-02-30', '2026-11-01')).toThrow(RangeError)
    expect(() => assertCreationStartDate('staff', '2026-11-01', 'not-a-date')).toThrow(RangeError)
  })
})

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
