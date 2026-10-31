import { useState } from 'react'
import { CustomerForm } from '../../customers/components/CustomerForm'
import { useOwnProfile, useUpdateOwnProfile } from '../../customers/hooks/useCustomers'
import { addressToValues, toProfilePayload, type CustomerFormValues } from '../../customers/schemas'
import type { OwnProfile } from '../../customers/types'
import '../../customers/customers.css'

const toValues = (p: OwnProfile): CustomerFormValues => ({
  name: p.name, company_name: p.company_name ?? '', email: p.email, phone: p.phone ?? '',
  ...addressToValues(p.address), tax_id: '', notes: '',
})

/** Customer portal: view and edit own contact details. Email is read-only; notes / active status are never shown. */
export function ProfilePage() {
  const query = useOwnProfile()
  const update = useUpdateOwnProfile()
  const [saved, setSaved] = useState(false)

  if (query.isPending) return <p role="status">Loading your profile…</p>
  if (query.isError) {
    return (
      <div role="alert" className="customer-error">
        <p>Could not load your profile: {query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()}>Retry</button>
      </div>
    )
  }
  return (
    <section className="customers-page">
      <h1>My profile</h1>
      <p>Email: <strong>{query.data.email}</strong> <span className="customer-muted">(contact support to change your email)</span></p>
      {saved && <p role="status" className="customer-flash">Profile updated.</p>}
      <CustomerForm
        key={JSON.stringify(query.data)}
        mode="profile"
        defaultValues={toValues(query.data)}
        submitLabel="Save profile"
        onSubmit={async (values) => {
          setSaved(false)
          await update.mutateAsync(toProfilePayload(values))
          setSaved(true)
        }}
      />
    </section>
  )
}
