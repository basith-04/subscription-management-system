// Integration slots on the invoice detail page. Each is an isolated, self-contained section so other
// features can fill them without touching InvoiceDetailPage:
//   F13 → PaymentsSlot renders the payments feature's PaymentsPanel (history, record payment, void)
//   F15 → replace the body of DiscountSlot with the applied-discount panel
// Do NOT add feature logic here; render the other feature's component instead.
import { PaymentsPanel } from '../../payments'
import type { InvoiceDetail } from '../types'

export interface InvoiceSlotProps { invoice: InvoiceDetail }

export function PaymentsSlot({ invoice }: InvoiceSlotProps) {
  // F13: payment history, "Record payment" and Void live in the payments feature.
  return (
    <PaymentsPanel
      invoice={{ id: invoice.id, number: invoice.number, status: invoice.status, customerId: invoice.customer.id, amountDue: invoice.amount_due }}
    />
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
