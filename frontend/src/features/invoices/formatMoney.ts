// Money is a string end to end — formatting never goes through Number.
/** Insert thousands separators into the integer part without leaving string space. */
export function formatMoney(value: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(value)
  if (!match) return value
  const [, sign = '', int = '', frac = ''] = match
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`
}
