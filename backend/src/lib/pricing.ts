// computeEffectivePrice — the single source of the sales_price + price_adjustment
// arithmetic. F06 unit-tested; consumed by F07, F08, F09, F12.
import { ApiError } from '../middleware/error-handler.js'
import { add, isNonNegative } from './money.js'

export interface PriceSource {
  sales_price: string
}

export interface AdjustmentSource {
  price_adjustment: string
}

export function computeEffectivePrice(
  product: PriceSource,
  variant?: AdjustmentSource,
): string {
  const effective = add(product.sales_price, variant?.price_adjustment ?? '0.00')
  if (!isNonNegative(effective)) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      'Effective price cannot be negative',
      [{ field: 'price_adjustment', message: 'sales_price + price_adjustment must be >= 0' }],
    )
  }
  return effective
}
