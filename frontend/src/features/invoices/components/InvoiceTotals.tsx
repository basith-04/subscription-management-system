import type { InvoiceDetail } from '../types'
import { Money } from './Money'

type Totals = Pick<InvoiceDetail, 'subtotal' | 'discount_total' | 'tax_total' | 'total' | 'amount_paid' | 'amount_due' | 'tax_details'>

export function InvoiceTotals({ invoice }: { invoice: Totals }) {
  return (
    <table className="invoice-totals" aria-label="Invoice totals">
      <tbody>
        <tr><th scope="row">Subtotal</th><td><Money value={invoice.subtotal} /></td></tr>
        <tr><th scope="row">Discount</th><td>−<Money value={invoice.discount_total} /></td></tr>
        {invoice.tax_details.map((t) => (
          <tr key={`${t.tax_name}:${t.tax_rate}`}>
            <th scope="row">{t.tax_name} ({t.tax_rate}%)</th><td><Money value={t.tax_amount} /></td>
          </tr>
        ))}
        <tr><th scope="row">Tax total</th><td><Money value={invoice.tax_total} /></td></tr>
        <tr className="invoice-totals__grand"><th scope="row">Total</th><td><Money value={invoice.total} /></td></tr>
        <tr><th scope="row">Amount paid</th><td><Money value={invoice.amount_paid} /></td></tr>
        <tr className="invoice-totals__grand"><th scope="row">Amount due</th><td><Money value={invoice.amount_due} /></td></tr>
      </tbody>
    </table>
  )
}
