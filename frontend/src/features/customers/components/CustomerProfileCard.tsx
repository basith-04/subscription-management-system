import type { Customer } from '../types'

const ADDRESS_ORDER = ['line1', 'line2', 'city', 'state', 'postal_code', 'country'] as const

/** Core profile display. Contains no subscription or finance logic; those live in the sections beside it. */
export function CustomerProfileCard({ customer }: { customer: Customer }) {
  const address = ADDRESS_ORDER.map((k) => customer.address[k]).filter(Boolean).join(', ')
  return (
    <section aria-label="Customer profile" className="customer-card">
      <dl>
        <dt>Name</dt><dd>{customer.name}</dd>
        <dt>Company</dt><dd>{customer.company_name ?? '—'}</dd>
        <dt>Email</dt><dd>{customer.email}</dd>
        <dt>Phone</dt><dd>{customer.phone ?? '—'}</dd>
        <dt>Address</dt><dd>{address || '—'}</dd>
        <dt>Tax ID</dt><dd>{customer.tax_id ?? '—'}</dd>
        <dt>Notes</dt><dd>{customer.notes ?? '—'}</dd>
        <dt>Portal login</dt><dd>{customer.has_portal_login ? 'Yes' : 'No'}</dd>
      </dl>
    </section>
  )
}
