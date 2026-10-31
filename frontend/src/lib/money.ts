export function formatMoney(amount: string, locale = 'en-IN'): string {
  const negative = amount.startsWith('-')
  const abs = negative ? amount.slice(1) : amount
  const [intPart, frac = '00'] = abs.split('.')
  const n = Number(intPart)
  const grouped = Number.isFinite(n) ? n.toLocaleString(locale) : intPart
  return `${negative ? '-' : ''}₹${grouped}.${(frac + '00').slice(0, 2)}`
}
