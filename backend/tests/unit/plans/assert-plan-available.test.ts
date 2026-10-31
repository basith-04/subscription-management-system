import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../src/middleware/error-handler.js'
import { assertPlanAvailable } from '../../../src/modules/plans/index.js'

const plan = { is_active: true, available_from: '2026-01-01', available_to: '2026-12-31' as string | null }

function codeOf(fn: () => void): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof ApiError) return `${error.status}:${error.code}`
    throw error
  }
  return undefined
}

describe('assertPlanAvailable', () => {
  it('accepts the start boundary (start = available_from)', () => {
    expect(codeOf(() => assertPlanAvailable(plan, '2026-01-01'))).toBeUndefined()
  })

  it('accepts the end boundary (start = available_to)', () => {
    expect(codeOf(() => assertPlanAvailable(plan, '2026-12-31'))).toBeUndefined()
  })

  it('rejects the day before available_from', () => {
    expect(codeOf(() => assertPlanAvailable(plan, '2025-12-31'))).toBe('422:PLAN_NOT_AVAILABLE')
  })

  it('rejects the day after available_to', () => {
    expect(codeOf(() => assertPlanAvailable(plan, '2027-01-01'))).toBe('422:PLAN_NOT_AVAILABLE')
  })

  it('treats a null available_to as open-ended', () => {
    const open = { ...plan, available_to: null }
    expect(codeOf(() => assertPlanAvailable(open, '2099-12-31'))).toBeUndefined()
    expect(codeOf(() => assertPlanAvailable(open, '2025-12-31'))).toBe('422:PLAN_NOT_AVAILABLE')
  })

  it('accepts a single-day window', () => {
    const oneDay = { ...plan, available_from: '2026-06-15', available_to: '2026-06-15' }
    expect(codeOf(() => assertPlanAvailable(oneDay, '2026-06-15'))).toBeUndefined()
    expect(codeOf(() => assertPlanAvailable(oneDay, '2026-06-16'))).toBe('422:PLAN_NOT_AVAILABLE')
  })

  it('rejects an inactive plan even inside the window', () => {
    expect(codeOf(() => assertPlanAvailable({ ...plan, is_active: false }, '2026-06-01'))).toBe(
      '422:PLAN_NOT_AVAILABLE',
    )
  })
})
