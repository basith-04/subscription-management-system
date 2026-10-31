// Decimal-safe money helpers. All amounts are strings; arithmetic uses BigInt minor units.
// ROUND_HALF_UP is applied where noted; the rest are exact.

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/

export function assertMoney(value: string, field = 'amount'): void {
  if (!MONEY_RE.test(value)) {
    throw new Error(`Invalid money format for ${field}: ${value}`)
  }
}

export function toMinor(amount: string): bigint {
  assertMoney(amount)
  const negative = amount.startsWith('-')
  const abs = negative ? amount.slice(1) : amount
  // `= '0'` / `= ''` defaults satisfy noUncheckedIndexedAccess; assertMoney
  // guarantees the int part is a non-empty digit string, so the default never
  // fires in practice.
  const [intPart = '0', frac = ''] = abs.split('.')
  const padded = (frac + '00').slice(0, 2)
  const minor = BigInt(intPart) * 100n + BigInt(padded)
  return negative ? -minor : minor
}

export function fromMinor(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const intPart = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${intPart}.${frac}`
}

export const add = (a: string, b: string): string => fromMinor(toMinor(a) + toMinor(b))
export const sub = (a: string, b: string): string => fromMinor(toMinor(a) - toMinor(b))
export const mulInt = (a: string, qty: number): string => fromMinor(toMinor(a) * BigInt(qty))
export const isZero = (a: string): boolean => toMinor(a) === 0n
export const isNegative = (a: string): boolean => toMinor(a) < 0n
export const isNonNegative = (a: string): boolean => toMinor(a) >= 0n
export const compare = (a: string, b: string): number => {
  const ma = toMinor(a)
  const mb = toMinor(b)
  return ma < mb ? -1 : ma > mb ? 1 : 0
}