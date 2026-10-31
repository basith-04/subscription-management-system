import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonthsClamped,
  periodEnd,
  periodStart,
} from './periods.js'

describe('addDays', () => {
  it('adds days inside a month', () => {
    expect(addDays('2026-03-01', 1)).toBe('2026-03-02')
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31')
  })

  it('rolls over month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('supports negative days', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('rejects non-integer offsets', () => {
    expect(() => addDays('2026-03-01', 1.5)).toThrow()
  })
})

describe('addMonthsClamped', () => {
  it('does not drift: computed from the anchor, not from the previous month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('handles leap years', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28')
    expect(addMonthsClamped('2028-02-29', 24)).toBe('2030-02-28')
    expect(addMonthsClamped('2028-02-29', 48)).toBe('2032-02-29')
  })

  it('rolls over years without clamping when unnecessary', () => {
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonthsClamped('2026-12-15', 12)).toBe('2027-12-15')
    expect(addMonthsClamped('2026-12-15', 13)).toBe('2028-01-15')
  })

  it('supports negative months', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('periodStart', () => {
  it('daily (billing-engine.md §2.1)', () => {
    expect(periodStart('2026-03-01', 0, 'daily')).toBe('2026-03-01')
    expect(periodStart('2026-03-01', 1, 'daily')).toBe('2026-03-02')
    expect(periodStart('2026-03-01', 2, 'daily')).toBe('2026-03-03')
  })

  it('weekly (billing-engine.md §2.1)', () => {
    expect(periodStart('2026-11-03', 0, 'weekly')).toBe('2026-11-03')
    expect(periodStart('2026-11-03', 1, 'weekly')).toBe('2026-11-10')
    expect(periodStart('2026-11-03', 2, 'weekly')).toBe('2026-11-17')
  })

  it('monthly anchor 31 Jan (billing-engine.md §2.1: 31 Jan, 28 Feb, 31 Mar, 30 Apr)', () => {
    expect(periodStart('2026-01-31', 0, 'monthly')).toBe('2026-01-31')
    expect(periodStart('2026-01-31', 1, 'monthly')).toBe('2026-02-28')
    expect(periodStart('2026-01-31', 2, 'monthly')).toBe('2026-03-31')
    expect(periodStart('2026-01-31', 3, 'monthly')).toBe('2026-04-30')
  })

  it('yearly anchor 29 Feb (billing-engine.md §2.1: 29 Feb 2028, 28 Feb 2029/30/31, 29 Feb 2032)', () => {
    expect(periodStart('2028-02-29', 0, 'yearly')).toBe('2028-02-29')
    expect(periodStart('2028-02-29', 1, 'yearly')).toBe('2029-02-28')
    expect(periodStart('2028-02-29', 2, 'yearly')).toBe('2030-02-28')
    expect(periodStart('2028-02-29', 3, 'yearly')).toBe('2031-02-28')
    expect(periodStart('2028-02-29', 4, 'yearly')).toBe('2032-02-29')
  })

  it('rejects impossible dates, malformed input and bad indices', () => {
    expect(() => periodStart('2026-02-30', 0, 'monthly')).toThrow()
    expect(() => periodStart('2026-13-01', 0, 'monthly')).toThrow()
    expect(() => periodStart('not-a-date', 0, 'daily')).toThrow()
    expect(() => periodStart('2026-01-01', -1, 'monthly')).toThrow()
    expect(() => periodStart('2026-01-01', 1.5, 'monthly')).toThrow()
  })
})

describe('periodEnd', () => {
  it('daily: one day before the next period start', () => {
    expect(periodEnd('2026-03-01', 0, 'daily')).toBe('2026-03-01')
    expect(periodEnd('2026-03-01', 1, 'daily')).toBe('2026-03-02')
    expect(periodEnd('2026-03-01', 30, 'daily')).toBe('2026-03-31')
  })

  it('weekly: six days before the next period start', () => {
    expect(periodEnd('2026-11-03', 0, 'weekly')).toBe('2026-11-09')
    expect(periodEnd('2026-11-03', 1, 'weekly')).toBe('2026-11-16')
  })

  it('monthly anchor 31 Jan: end is the day before the next clamped start', () => {
    expect(periodEnd('2026-01-31', 0, 'monthly')).toBe('2026-02-27')
    expect(periodEnd('2026-01-31', 1, 'monthly')).toBe('2026-03-30')
    expect(periodEnd('2026-01-31', 2, 'monthly')).toBe('2026-04-29')
  })

  it('yearly anchor 29 Feb: end is the day before the next clamped start', () => {
    expect(periodEnd('2028-02-29', 0, 'yearly')).toBe('2029-02-27')
    expect(periodEnd('2028-02-29', 1, 'yearly')).toBe('2030-02-27')
    expect(periodEnd('2028-02-29', 2, 'yearly')).toBe('2031-02-27')
    expect(periodEnd('2028-02-29', 3, 'yearly')).toBe('2032-02-28')
  })
})
