export const DEFAULT_APP_TIMEZONE = 'Asia/Kolkata'

/**
 * Returns the calendar date of `now` in the configured business timezone.
 */
export function todayInAppTimezone(
  now: Date = new Date(),
  timeZone: string = process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`
}
