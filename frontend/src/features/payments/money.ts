// Decimal-safe money helpers for the payment forms. Amounts are strings; arithmetic uses BigInt minor units
// (never Number), so 0.10 + 0.20 === 0.30 exactly.
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/

export const isAmount = (v: string): boolean => AMOUNT_RE.test(v.trim())

export function toMinor(v: string): bigint {
  const [i = '0', f = ''] = v.trim().split('.')
  return BigInt(i) * 100n + BigInt((f + '00').slice(0, 2))
}

export function fromMinor(m: bigint): string {
  const neg = m < 0n
  const a = neg ? -m : m
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`
}

/** Sum of the VALID amounts in the list (invalid entries count as zero). */
export const sumAmounts = (values: readonly string[]): string =>
  fromMinor(values.reduce((acc, v) => (isAmount(v) ? acc + toMinor(v) : acc), 0n))

export const compareAmounts = (a: string, b: string): number => {
  const x = toMinor(a), y = toMinor(b)
  return x < y ? -1 : x > y ? 1 : 0
}
