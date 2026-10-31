import { ERROR_CODES } from '../../lib/error-codes.js'
import { ApiError } from '../../lib/errors.js'
import { isCalendarDate } from '../../lib/dates.js'

/** F09 owns only quotation issue, confirmation and pre-activation cancellation. */
export type F09SubscriptionAction = 'issue' | 'confirm' | 'cancel'
export type SubscriptionStatus = 'draft' | 'quotation' | 'confirmed' | 'active' | 'closed'

const transitions: Readonly<Record<F09SubscriptionAction, {
  readonly from: readonly SubscriptionStatus[]
  readonly to: SubscriptionStatus
}>> = {
  issue: { from: ['draft'], to: 'quotation' },
  confirm: { from: ['quotation'], to: 'confirmed' },
  cancel: { from: ['draft', 'quotation', 'confirmed'], to: 'closed' },
}

/**
 * Determine the F09 target state without mutating data. The service must still
 * lock the record, enforce ownership and business guards, then use the shared
 * transactional transition helper and audit in the same transaction. F10 will
 * extend this module rather than bypassing the shared transition mechanism.
 */
export function getF09Transition(action: F09SubscriptionAction, current: string): SubscriptionStatus {
  const rule = transitions[action]
  if (!rule || !(rule.from as readonly string[]).includes(current)) {
    throw new ApiError(409, ERROR_CODES.INVALID_STATE_TRANSITION, 'Subscription state does not permit this action')
  }
  return rule.to
}

/** `today` is supplied by the business-time-zone clock, never inferred here. */
export function assertQuotationValidity(validUntil: string | null, today: string): void {
  if (!isCalendarDate(today)) throw new RangeError('Invalid business date')
  if (!validUntil || !isCalendarDate(validUntil) || today > validUntil) {
    throw new ApiError(409, ERROR_CODES.QUOTATION_EXPIRED, 'Quotation has expired')
  }
}
