import { ERROR_CODES } from '../../lib/error-codes.js'
import { ApiError } from '../../lib/errors.js'
import { assertPlanAvailable, type PlanAvailabilityFields } from '../plans/index.js'

export interface SubscriptionPlanRules extends PlanAvailabilityFields {
  min_quantity: number
}

/**
 * Validate current plan availability and per-line minimums. The caller must
 * reload the current plan inside the transaction; input schemas must already
 * have checked each quantity is a positive database integer.
 */
export function assertPlanAndQuantities(
  plan: SubscriptionPlanRules,
  startDate: string,
  items: readonly { quantity: number }[],
): void {
  assertPlanAvailable(plan, startDate)
  if (!Number.isSafeInteger(plan.min_quantity) || plan.min_quantity < 1) {
    throw new RangeError('Invalid plan minimum quantity')
  }
  for (const [index, item] of items.entries()) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 2_147_483_647) {
      throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', [
        { field: `items.${index}.quantity`, message: 'Quantity must be a positive integer' },
      ])
    }
    if (item.quantity < plan.min_quantity) {
      throw new ApiError(422, ERROR_CODES.QUANTITY_BELOW_MINIMUM, 'Quantity is below the plan minimum', [
        { field: `items.${index}.quantity`, message: `Quantity must be at least ${plan.min_quantity}` },
      ])
    }
  }
}
