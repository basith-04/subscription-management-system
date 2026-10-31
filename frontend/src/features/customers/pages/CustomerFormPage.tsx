import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CustomerForm } from '../components/CustomerForm'
import { useCreateCustomer, useCustomer, useUpdateCustomer } from '../hooks/useCustomers'
import { addressToValues, emptyAddressValues, toCustomerPayload, type CustomerFormValues } from '../schemas'
import type { Customer } from '../types'
import '../customers.css'

const EMPTY: CustomerFormValues = {
  name: '', company_name: '', email: '', phone: '', ...emptyAddressValues, tax_id: '', notes: '',
}

const toValues = (c: Customer): CustomerFormValues => ({
  name: c.name, company_name: c.company_name ?? '', email: c.email, phone: c.phone ?? '',
  ...addressToValues(c.address), tax_id: c.tax_id ?? '', notes: c.notes ?? '',
})

/** `/app/customers/new` (create) and `/app/customers/:id/edit` (edit). */
export function CustomerFormPage() {
  const id = Number(useParams().id)
  if (useParams().id === undefined) return <CreateCustomer />
  if (!Number.isSafeInteger(id) || id <= 0) return <Navigate to="/app/customers" replace />
  return <EditCustomer id={id} />
}

function CreateCustomer() {
  const navigate = useNavigate()
  const create = useCreateCustomer()
  return (
    <section className="customers-page">
      <h1>New customer</h1>
      <CustomerForm
        mode="staff" defaultValues={EMPTY} submitLabel="Create customer"
        onCancel={() => navigate('/app/customers')}
        onSubmit={async (values) => {
          const customer = await create.mutateAsync(toCustomerPayload(values))
          navigate(`/app/customers/${customer.id}`, { state: { flash: 'Customer created.', warnings: customer.warnings } })
        }}
      />
    </section>
  )
}

function EditCustomer({ id }: { id: number }) {
  const navigate = useNavigate()
  const query = useCustomer(id)
  const update = useUpdateCustomer(id)
  if (query.isPending) return <p role="status">Loading customer…</p>
  if (query.isError) {
    return (
      <div role="alert" className="customer-error">
        <p>Could not load customer: {query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()}>Retry</button>
      </div>
    )
  }
  return (
    <section className="customers-page">
      <h1>Edit customer</h1>
      <CustomerForm
        mode="staff" defaultValues={toValues(query.data)} submitLabel="Save changes"
        onCancel={() => navigate(`/app/customers/${id}`)}
        onSubmit={async (values) => {
          const customer = await update.mutateAsync(toCustomerPayload(values))
          navigate(`/app/customers/${id}`, { state: { flash: 'Customer saved.', warnings: customer.warnings } })
        }}
      />
    </section>
  )
}
