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
