// Statuses and enums for subscriptions (values match DB CHECK constraints).
export const SUBSCRIPTION_STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'closed'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/** A quotation is a subscription in one of these statuses (no separate table). */
export const QUOTATION_STATUSES = ['draft', 'quotation'] as const

export const SUBSCRIPTION_ENTITY = 'subscription'

export const SUBSCRIPTION_AUDIT = {
  create: 'subscription.create',
  update: 'subscription.update',
  issue: 'subscription.issue',
  confirm: 'subscription.confirm',
  cancel: 'subscription.cancel',
} as const

/** closed_reason written by an F09 cancellation (docs/architecture/state-machines.md §2.2). */
export const CANCELLED_REASON = 'cancelled'
export const MAX_ITEMS = 200
