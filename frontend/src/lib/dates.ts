// Display-only date formatting; wire format stays YYYY-MM-DD / ISO-8601. PLACEHOLDER — replace with implementation.
/** Display an ISO date without altering the date-only wire value. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString()
}
