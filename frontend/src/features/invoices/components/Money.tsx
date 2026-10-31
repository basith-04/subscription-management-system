import { formatMoney } from '../formatMoney'

// Display component for API money strings. Money is a string end to end — never parsed to a Number here.
export interface MoneyProps {
  /** Decimal string from the API, e.g. "1560.00". */
  value: string
  /** Optional currency code/symbol prefix, e.g. "INR". */
  currency?: string
  className?: string
}

export function Money({ value, currency, className }: MoneyProps) {
  return (
    <span className={`invoice-money${className ? ` ${className}` : ''}`} data-money={value}>
      {currency ? `${currency} ` : ''}{formatMoney(value)}
    </span>
  )
}
