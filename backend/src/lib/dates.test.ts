import { describe, expect, it } from 'vitest'
import { isCalendarDate, todayInTimezone } from './dates.js'
import { loadConfig } from '../config.js'

describe('business dates', () => {
  it('respects midnight in the configured timezone', () => {
    const instant = new Date('2026-10-31T18:30:00Z')
    expect(todayInTimezone(instant, 'Asia/Kolkata')).toBe('2026-11-01')
    expect(todayInTimezone(instant, 'UTC')).toBe('2026-10-31')
    expect(todayInTimezone(new Date('2026-10-31T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-10-31')
  })

  it('validates leap days and rejects nonexistent dates and PostgreSQL year zero', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true)
    for (const value of ['2027-02-29', '2026-13-01', '0000-01-01', '2026-2-01', 'not-a-date']) {
      expect(isCalendarDate(value)).toBe(false)
    }
  })

  it('rejects invalid clocks and timezones', () => {
    expect(() => todayInTimezone(new Date('invalid'), 'UTC')).toThrow(RangeError)
    expect(() => todayInTimezone(new Date('2026-01-01T00:00:00Z'), 'Not/AZone')).toThrow(RangeError)
    expect(() => loadConfig({ APP_TIMEZONE: 'Not/AZone' } as NodeJS.ProcessEnv)).toThrow(/APP_TIMEZONE/)
    expect(loadConfig({} as NodeJS.ProcessEnv).appTimezone).toBe('Asia/Kolkata')
  })
})

describe('business-date boundaries (D-22)', () => {
  const instant = new Date('2026-11-10T18:29:59Z') // 23:59:59 on the 10th in Asia/Kolkata
  it('rolls over at local midnight, not at UTC midnight', async () => {
    const { todayInAppTimezone, todayInTimezone } = await import('./dates.js')
    expect(todayInAppTimezone(instant, 'Asia/Kolkata')).toBe('2026-11-10')
    expect(todayInAppTimezone(new Date(instant.getTime() + 1000), 'Asia/Kolkata')).toBe('2026-11-11')
    expect(todayInAppTimezone(instant, 'UTC')).toBe('2026-11-10')
    expect(todayInAppTimezone(new Date('2026-11-10T00:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-09')
  })
  it('todayInAppTimezone is the same computation as todayInTimezone (single implementation)', async () => {
    const { todayInAppTimezone, todayInTimezone } = await import('./dates.js')
    for (const tz of ['Asia/Kolkata', 'UTC', 'Pacific/Auckland']) expect(todayInAppTimezone(instant, tz)).toBe(todayInTimezone(instant, tz))
    expect(() => todayInAppTimezone(new Date(Number.NaN), 'UTC')).toThrow(RangeError)
  })
})
