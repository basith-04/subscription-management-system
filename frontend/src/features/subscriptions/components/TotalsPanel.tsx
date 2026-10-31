import type { Totals } from '../types'

/** Subtotal, estimated tax and total. These are estimates before discounts; invoices are authoritative. */
export function TotalsPanel({ totals }: { totals: Totals }) {
  return (
    <dl className="sub-totals" aria-label="Totals">
      <div><dt>Subtotal</dt><dd data-testid="subtotal">{totals.subtotal}</dd></div>
      <div><dt>Estimated tax</dt><dd data-testid="tax">{totals.estimated_tax}</dd></div>
      <div className="sub-totals__grand"><dt>Total</dt><dd data-testid="total">{totals.total}</dd></div>
      <p className="sub-muted">Estimate before discounts. Invoices are authoritative.</p>
    </dl>
  )
}
