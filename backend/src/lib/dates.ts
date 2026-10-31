/** Validate an ISO calendar date suitable for PostgreSQL DATE. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Resolve a supplied instant in the configured business timezone (D-22). */
export function todayInTimezone(instant: Date, timeZone: string): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid clock instant')
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = formatter.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value
  const year = part('year')?.padStart(4, '0')
  const value = `${year}-${part('month')}-${part('day')}`
  if (!isCalendarDate(value)) throw new RangeError('Business date is outside supported range')
  return value
}

export const DEFAULT_APP_TIMEZONE = 'Asia/Kolkata'

/**
 * Returns the calendar date of `now` in the configured business timezone.
 */
export function todayInAppTimezone(
  now: Date = new Date(),
  timeZone: string = process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE,
): string {
  return todayInTimezone(now, timeZone)
}
