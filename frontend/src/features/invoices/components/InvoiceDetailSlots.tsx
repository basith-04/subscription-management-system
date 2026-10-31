// Integration slots on the invoice detail page. Each is an isolated, self-contained section so other
// features can fill them without touching InvoiceDetailPage:
//   F13 → replace the body of PaymentsSlot with its payments panel (record payment, allocations, void)
//   F15 → replace the body of DiscountSlot with the applied-discount panel
// Do NOT add feature logic here; render the other feature's component instead.
import type { InvoiceDetail } from '../types'

export interface InvoiceSlotProps { invoice: InvoiceDetail }

export function PaymentsSlot({ invoice }: InvoiceSlotProps) {
  return (
    <section className="invoice-slot" data-slot="payments" aria-label="Payments">
      <h2>Payments</h2>
      <p className="invoice-muted">Payments for {invoice.number} will appear here once payment recording (F13) is available.</p>
    </section>
  )
}

export function DiscountSlot({ invoice }: InvoiceSlotProps) {
  return (
    <section className="invoice-slot" data-slot="discount" aria-label="Discount">
      <h2>Discount</h2>
      <p className="invoice-muted">Applied discounts for {invoice.number} will appear here once discounts (F15) are available.</p>
    </section>
  )
}
