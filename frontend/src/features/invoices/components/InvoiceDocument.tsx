import type { InvoiceDetail } from '../types'
import { InvoiceTotals } from './InvoiceTotals'
import { Money } from './Money'
import { PaymentStateBadge } from './PaymentStateBadge'

function addressLines(address: Record<string, unknown> | null): string[] {
  if (!address) return []
  const g = (k: string) => (typeof address[k] === 'string' ? (address[k] as string).trim() : '')
  return [g('line1'), g('line2'), [g('city'), g('state'), g('postal_code')].filter(Boolean).join(', '), g('country')].filter(Boolean)
}

/**
 * The printable invoice. Renders ONLY the invoice's own snapshot (customer, lines, tax, totals) so it is
 * identical for staff today and for the customer portal in F14. React escapes every text node; no HTML is injected.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const address = addressLines(invoice.customer.billing_address)
  return (
    <article className="invoice-document" aria-label={`Invoice ${invoice.number}`}>
      <header className="invoice-document__head">
        <div>
          <h1>INVOICE</h1>
          <p className="invoice-muted">{invoice.number}</p>
        </div>
        <div className="invoice-document__state">
          <strong>Brightloop</strong>
          <PaymentStateBadge state={invoice.payment_state} />
          {invoice.status === 'draft' && <p className="invoice-watermark">DRAFT — not yet issued</p>}
          {invoice.status === 'cancelled' && <p className="invoice-watermark">CANCELLED</p>}
        </div>
      </header>

      <section className="invoice-document__meta">
        <div>
          <p className="invoice-muted">Billed to</p>
          <p><strong>{invoice.customer.name}</strong></p>
          <p>{invoice.customer.email}</p>
          {address.map((line) => <p key={line}>{line}</p>)}
          {invoice.customer.tax_id && <p>Tax ID: {invoice.customer.tax_id}</p>}
        </div>
        <dl>
          <dt>Issue date</dt><dd>{invoice.issue_date}</dd>
          <dt>Due date</dt><dd>{invoice.due_date}</dd>
          <dt>Payment terms</dt><dd>{invoice.payment_term}</dd>
          <dt>Billing period</dt><dd>{invoice.period_start} to {invoice.period_end}</dd>
          {invoice.subscription.number && (<><dt>Subscription</dt><dd>{invoice.subscription.number}</dd></>)}
        </dl>
      </section>

      <table className="invoice-lines" aria-label="Invoice lines">
        <thead>
          <tr>
            <th>Description</th><th className="num">Qty</th><th className="num">Unit price</th>
            <th className="num">Discount</th><th>Tax</th><th className="num">Line total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td className="desc">{item.description}</td>
              <td className="num">{item.quantity}</td>
              <td className="num"><Money value={item.unit_price} /></td>
              <td className="num"><Money value={item.discount_amount} /></td>
              <td>{item.tax_name ? `${item.tax_name} (${item.tax_rate}%)` : '—'}</td>
              <td className="num"><Money value={item.line_total} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <InvoiceTotals invoice={invoice} />
      {invoice.notes && <p className="invoice-note">{invoice.notes}</p>}
    </article>
  )
}
