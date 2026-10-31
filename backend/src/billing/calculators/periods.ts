// Pure period-date math for the billing engine (F12).
// No imports from modules/ and no I/O, so this file is unit-testable in isolation.
// See docs/architecture/billing-engine.md §2.1 for the rules implemented here.
//
// All dates are calendar dates in 'YYYY-MM-DD' format (no time zone).
// `addMonthsClamped` is the `add_months(anchor, n), clamped` operation from
// the §2.1 table — always computed from the anchor, never from the previous period,
// so a monthly plan anchored on the 31st does not drift.

export type BillingFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(iso)
  if (!match) throw new Error(`Invalid date (expected YYYY-MM-DD): ${iso}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Reject impossible calendar dates (2026-02-30, 2026-13-01, …).
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${iso}`)
  }
  return { year, month, day }
}

function formatIsoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysInMonth(year: number, month1Based: number): number {
  // Day 0 of the next month is the last day of the requested month.
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate()
}

export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new Error(`addDays: days must be an integer, got ${days}`)
  }
  const { year, month, day } = parseIsoDate(date)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

export function addMonthsClamped(date: string, months: number): string {
  if (!Number.isInteger(months)) {
    throw new Error(`addMonthsClamped: months must be an integer, got ${months}`)
  }
  const { year, month, day } = parseIsoDate(date)
  // Working in "months since year 0" keeps this an anchored calculation,
  // so 31 Jan + 2 months = 31 Mar, not 28 Mar.
  const totalMonths = year * 12 + (month - 1) + months
  const newYear = Math.floor(totalMonths / 12)
  const newMonth0 = totalMonths - newYear * 12 // 0-indexed
  const lastDay = daysInMonth(newYear, newMonth0 + 1)
  const newDay = Math.min(day, lastDay)
  return formatIsoDate(newYear, newMonth0 + 1, newDay)
}

export function periodStart(anchor: string, n: number, frequency: BillingFrequency): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`periodStart: period index must be a non-negative integer, got ${n}`)
  }
  switch (frequency) {
    case 'daily':
      return addDays(anchor, n)
    case 'weekly':
      return addDays(anchor, 7 * n)
    case 'monthly':
      return addMonthsClamped(anchor, n)
    case 'yearly':
      return addMonthsClamped(anchor, 12 * n)
  }
}

export function periodEnd(anchor: string, n: number, frequency: BillingFrequency): string {
  const nextStart = periodStart(anchor, n + 1, frequency)
  return addDays(nextStart, -1)
}
