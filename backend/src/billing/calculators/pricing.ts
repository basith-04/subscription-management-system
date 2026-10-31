import { fromMinor, toMinor } from '../../lib/money.js'
import { computeEffectivePrice, type AdjustmentSource, type PriceSource } from '../../lib/pricing.js'

/** F09/F12 shared, pre-discount pricing. All amounts are decimal strings. */
export interface UnitPriceInput {
  product: PriceSource
  variant?: AdjustmentSource
  lineOverride?: string | null
  templateOverride?: string | null
}

export interface PriceLineInput {
  quantity: number
  unit_price: string
  /** Percentage with up to three decimal places; absent means no tax. */
  tax_rate?: string | null
}

export interface PriceLine {
  line_amount: string
  tax_amount: string
  line_total: string
}

export interface PriceTotals {
  subtotal: string
  estimated_tax: string
  total: string
}

const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/
const RATE_PATTERN = /^\d{1,3}(?:\.\d{1,3})?$/
const MAX_MONEY_MINOR = 999_999_999_999n // NUMERIC(12,2)
const MAX_QUANTITY = 2_147_483_647 // PostgreSQL INT
const RATE_DENOMINATOR = 100_000n // percentage with three decimal places

function moneyMinor(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new RangeError('Invalid non-negative money amount')
  const amount = toMinor(value)
  if (amount > MAX_MONEY_MINOR) throw new RangeError('Money amount exceeds NUMERIC(12,2)')
  return amount
}

function rateThousandths(value: string): bigint {
  if (!RATE_PATTERN.test(value)) throw new RangeError('Invalid tax rate')
  const [whole = '0', fraction = ''] = value.split('.')
  const rate = BigInt(whole) * 1_000n + BigInt((fraction + '000').slice(0, 3))
  if (rate > 100_000n) throw new RangeError('Tax rate must be between 0 and 100')
  return rate
}

/** Explicit line override wins over template override, then F06 effective price. */
export function resolveUnitPrice(input: UnitPriceInput): string {
  const selected = input.lineOverride ?? input.templateOverride ??
    computeEffectivePrice(input.product, input.variant)
  return fromMinor(moneyMinor(selected))
}

/** Tax is rounded half-up once per line, never via floating-point arithmetic. */
export function computeLine(input: PriceLineInput): PriceLine {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY) {
    throw new RangeError('Quantity must be a positive PostgreSQL integer')
  }
  const lineAmount = moneyMinor(input.unit_price) * BigInt(input.quantity)
  if (lineAmount > MAX_MONEY_MINOR) throw new RangeError('Line amount exceeds NUMERIC(12,2)')
  const taxNumerator = lineAmount * rateThousandths(input.tax_rate ?? '0')
  const tax = (taxNumerator + RATE_DENOMINATOR / 2n) / RATE_DENOMINATOR
  // Invoices and quotes store totals as NUMERIC(12,2), so the tax-inclusive line total must fit as well.
  if (lineAmount + tax > MAX_MONEY_MINOR) throw new RangeError('Line total exceeds NUMERIC(12,2)')
  return {
    line_amount: fromMinor(lineAmount),
    tax_amount: fromMinor(tax),
    line_total: fromMinor(lineAmount + tax),
  }
}

/** Sum individually rounded line taxes; excludes discounts. */
export function computeTotals(inputs: readonly PriceLineInput[]): PriceTotals {
  let subtotal = 0n
  let estimatedTax = 0n
  for (const input of inputs) {
    const line = computeLine(input)
    subtotal += toMinor(line.line_amount)
    estimatedTax += toMinor(line.tax_amount)
  }
  if (subtotal + estimatedTax > MAX_MONEY_MINOR) throw new RangeError('Total exceeds NUMERIC(12,2)')
  return {
    subtotal: fromMinor(subtotal),
    estimated_tax: fromMinor(estimatedTax),
    total: fromMinor(subtotal + estimatedTax),
  }
}
