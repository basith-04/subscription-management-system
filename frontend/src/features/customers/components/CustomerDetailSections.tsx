// Named integration slots on the customer detail page. Each later feature replaces ONLY its own
// section's body; the core profile component and the page layout are not touched.
// None of these fetch or display fabricated data.

export function CustomerSubscriptionsSection({ customerId }: { customerId: number }) {
  // F09: render the customer's subscriptions (GET /subscriptions?customer_id=…).
  return (
    <section aria-label="Subscriptions" data-customer-id={customerId} className="customer-section">
      <h2>Subscriptions</h2>
      <p className="customer-muted">Subscriptions will appear here once subscription management (F09) is available.</p>
    </section>
  )
}

export function CustomerInvoicesSection({ customerId }: { customerId: number }) {
  // F13: render the customer's invoices (GET /invoices?customer_id=…).
  return (
    <section aria-label="Invoices" data-customer-id={customerId} className="customer-section">
      <h2>Invoices</h2>
      <p className="customer-muted">Invoices will appear here once invoicing and payments (F13) are available.</p>
    </section>
  )
}

export function CustomerOutstandingSection({ outstanding, overdue }: { outstanding: string | null; overdue: string | null }) {
  // F13 provides outstanding_amount / overdue_amount; both are null until then.
  return (
    <section aria-label="Outstanding amounts" className="customer-section">
      <h2>Outstanding amounts</h2>
      {outstanding === null && overdue === null ? (
        <p className="customer-muted">Outstanding and overdue amounts will appear here once payments (F13) are available.</p>
      ) : (
        <dl><dt>Outstanding</dt><dd>{outstanding ?? '—'}</dd><dt>Overdue</dt><dd>{overdue ?? '—'}</dd></dl>
      )}
    </section>
  )
}
