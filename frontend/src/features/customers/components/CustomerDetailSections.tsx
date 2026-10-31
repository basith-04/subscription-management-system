import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listInvoices } from '../../../api/invoices'
import { PaymentStateBadge } from '../../invoices'

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

export function CustomerOutstandingSection({ customerId, outstanding, overdue }: { customerId: number; outstanding: string | null; overdue: string | null }) {
  // F13 provides outstanding_amount / overdue_amount (null only while invoices are not migrated).
  // The invoice rows come from F11's list endpoint filtered to this customer's open invoices.
  const open = useQuery({
    queryKey: ['invoices', 'list', 'customer-open', customerId],
    queryFn: () => listInvoices({ customer_id: customerId, payment_state: 'not_due,outstanding,partially_paid,overdue', sort: 'due_date', page_size: 50 }),
    enabled: outstanding !== null, retry: false,
  })
  return (
    <section aria-label="Outstanding amounts" className="customer-section">
      <h2>Outstanding amounts</h2>
      {outstanding === null && overdue === null ? (
        <p className="customer-muted">Outstanding and overdue amounts are not available yet.</p>
      ) : (
        <>
          <dl><dt>Total outstanding</dt><dd data-testid="outstanding-total">{outstanding ?? '—'}</dd><dt>Total overdue</dt><dd data-testid="overdue-total">{overdue ?? '—'}</dd></dl>
          {open.isPending && <p role="status">Loading invoices…</p>}
          {open.isError && <p role="alert" className="customer-error">Could not load the open invoices.</p>}
          {open.isSuccess && open.data.data.length === 0 && <p className="customer-muted">No unpaid invoices.</p>}
          {open.isSuccess && open.data.data.length > 0 && (
            <table className="customers-table" aria-label="Open invoices">
              <thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th>Amount due</th></tr></thead>
              <tbody>
                {open.data.data.map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/app/invoices/${i.id}`}>{i.number}</Link></td>
                    <td>{i.due_date}</td>
                    <td><PaymentStateBadge state={i.payment_state} /></td>
                    <td>{i.amount_due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
