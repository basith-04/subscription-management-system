import type { SubscriptionStatus } from '../types'

/** Badge for the five official states plus the derived paused / expired-quote variants (via display_status). */
export function SubscriptionStatusBadge({ status, displayStatus }: { status: SubscriptionStatus; displayStatus?: string }) {
  const variant = displayStatus?.includes('Paused') ? 'paused' : displayStatus?.includes('expired') ? 'expired' : status
  return <span className={`sub-badge sub-badge--${variant}`} data-status={status}>{displayStatus ?? status}</span>
}
