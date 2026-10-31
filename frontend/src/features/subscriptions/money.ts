// Decimal-safe line maths for the quotation editor (mirrors backend billing/calculators/pricing.ts). BigInt minor units only.
const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const RATE = /^\d{1,3}(\.\d{1,3})?$/

export const isMoney = (v: string): boolean => MONEY.test(v.trim())
export const toMinor = (v: string): bigint => {
  const [i = '0', f = ''] = v.trim().split('.')
  return BigInt(i) * 100n + BigInt((f + '00').slice(0, 2))
}
export const fromMinor = (m: bigint): string => `${m < 0n ? '-' : ''}${(m < 0n ? -m : m) / 100n}.${((m < 0n ? -m : m) % 100n).toString().padStart(2, '0')}`

export interface LineInput { quantity: string; unit_price: string; tax_rate?: string | null }
export interface LineResult { line_amount: string; tax_amount: string; line_total: string }

/** Tax rounded half-up once per line, exactly like the server. Returns null while the inputs are not valid. */
export function computeLine({ quantity, unit_price, tax_rate }: LineInput): LineResult | null {
  if (!/^[1-9]\d{0,9}$/.test(quantity.trim()) || !isMoney(unit_price)) return null
  const rate = tax_rate ?? '0'
  if (!RATE.test(rate)) return null
  const [w = '0', f = ''] = rate.split('.')
  const thousandths = BigInt(w) * 1000n + BigInt((f + '000').slice(0, 3))
  const amount = toMinor(unit_price) * BigInt(quantity)
  const tax = (amount * thousandths + 50_000n) / 100_000n
  return { line_amount: fromMinor(amount), tax_amount: fromMinor(tax), line_total: fromMinor(amount + tax) }
}

export function computeTotals(lines: Array<LineResult | null>) {
  let subtotal = 0n, tax = 0n
  for (const l of lines) if (l) { subtotal += toMinor(l.line_amount); tax += toMinor(l.tax_amount) }
  return { subtotal: fromMinor(subtotal), estimated_tax: fromMinor(tax), total: fromMinor(subtotal + tax) }
}

/** Effective price = product price + variant adjustment (F06 rule); null when it would be negative or invalid. */
export function effectivePrice(salesPrice: string, adjustment: string | null | undefined): string | null {
  const adj = adjustment ?? '0.00'
  const neg = adj.startsWith('-')
  const a = toMinor(neg ? adj.slice(1) : adj)
  const total = toMinor(salesPrice) + (neg ? -a : a)
  return total < 0n ? null : fromMinor(total)
}

export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}
