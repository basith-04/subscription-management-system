// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../../lib/api'
import { ProfilePage } from '../../portal/pages/ProfilePage'
import { CustomerForm } from '../components/CustomerForm'
import { CustomerSelect } from '../components/CustomerSelect'
import { CustomerDetailPage } from '../pages/CustomerDetailPage'
import { CustomerListPage } from '../pages/CustomerListPage'
import { customerFormSchema, toCustomerPayload } from '../schemas'
import type { CustomerFormValues } from '../schemas'

vi.mock('../../../lib/api', async (original) => {
  const actual = await original<typeof import('../../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
const request = vi.mocked(apiRequest)

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })

const item = (id: number, name: string, over = {}) => ({ id, name, company_name: null, email: `${name.toLowerCase()}@example.com`, phone: null, is_active: true, ...over })
const page = (data: unknown[], meta = {}) => ({ data, meta: { page: 1, page_size: 20, total: data.length, total_pages: 1, ...meta } })
const address = { line1: null, line2: null, city: null, state: null, postal_code: null, country: null }
const detail = (over = {}) => ({ ...item(7, 'Asha'), address, tax_id: null, notes: null, has_portal_login: false, subscriptions_count: null, outstanding_amount: null, overdue_amount: null, ...over })

function wrap(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>)
}
const SearchEcho = () => <output data-testid="loc">{useLocation().search}</output>
const calls = () => request.mock.calls.map((c) => String(c[0]))

describe('CustomerListPage', () => {
  beforeEach(() => { request.mockResolvedValue(page([item(1, 'Anna'), item(2, 'Bob')])) })

  it('reads filters and page from the URL and sends them to the API', async () => {
    wrap(<Routes><Route path="/app/customers" element={<CustomerListPage />} /></Routes>, '/app/customers?q=anna&is_active=false&sort=-name&page=3')
    await screen.findByText('Anna')
    expect(calls().some((c) => c === '/customers?q=anna&is_active=false&sort=-name&page=3')).toBe(true)
    expect(screen.getByLabelText('Status')).toHaveValue('false')
    expect(screen.getByLabelText('Sort')).toHaveValue('-name')
  })

  it('writes filter changes back to the URL and resets the page', async () => {
    const user = userEvent.setup()
    wrap(<><Routes><Route path="/app/customers" element={<CustomerListPage />} /></Routes><SearchEcho /></>, '/app/customers?page=2')
    await screen.findByText('Anna')
    await user.selectOptions(screen.getByLabelText('Status'), 'true')
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('is_active=true'))
    expect(screen.getByTestId('loc').textContent).not.toContain('page=2')
  })

  it('debounces the search box into the URL', async () => {
    const user = userEvent.setup()
    wrap(<><Routes><Route path="/app/customers" element={<CustomerListPage />} /></Routes><SearchEcho /></>, '/app/customers')
    await screen.findByText('Anna')
    await user.type(screen.getByLabelText('Search'), 'bo')
    expect(screen.getByTestId('loc')).toHaveTextContent('')
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('q=bo'))
  })

  it('shows the empty state, an error with retry, and loading', async () => {
    request.mockResolvedValueOnce(page([]))
    wrap(<Routes><Route path="/app/customers" element={<CustomerListPage />} /></Routes>, '/app/customers')
    expect(screen.getByText('Loading customers…')).toBeInTheDocument()
    expect(await screen.findByText('No customers match')).toBeInTheDocument()
    cleanup()

    request.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'The service is unavailable.')).mockResolvedValueOnce(page([item(1, 'Anna')]))
    const user = userEvent.setup()
    wrap(<Routes><Route path="/app/customers" element={<CustomerListPage />} /></Routes>, '/app/customers')
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Anna')).toBeInTheDocument()
  })
})

describe('CustomerForm validation', () => {
  const values: CustomerFormValues = customerFormSchema.parse({
    name: 'Asha', company_name: '', email: 'asha@example.com', phone: '', address_line1: '', address_line2: '', address_city: '',
    address_state: '', address_postal_code: '', address_country: '', tax_id: '', notes: '',
  })

  it('blocks submit and shows inline errors for bad input', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CustomerForm mode="staff" defaultValues={{ ...values, name: '', email: '' }} submitLabel="Save" onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Phone'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('maps server field errors back onto the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', [{ field: 'address.postal_code', message: 'Too long' }]))
    render(<CustomerForm mode="staff" defaultValues={values} submitLabel="Save" onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Too long')).toBeInTheDocument()
  })

  it('builds the API payload with empty strings as null and a nested address', () => {
    const p = toCustomerPayload({ ...values, company_name: ' Co ', address_city: 'Kochi' })
    expect(p).toMatchObject({ company_name: 'Co', phone: null, tax_id: null, address: { city: 'Kochi', line1: null } })
  })

  it('warns before leaving a dirty form and not a clean one', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CustomerForm mode="staff" defaultValues={values} submitLabel="Save" onSubmit={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Name'), 'x')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('Profile page restrictions', () => {
  const profile = { id: 5, name: 'Alice', company_name: null, email: 'alice@example.com', phone: null, address, tax_id: null }

  it('offers only permitted fields; email is read-only text and sensitive fields are absent', async () => {
    request.mockResolvedValue(profile)
    wrap(<ProfilePage />)
    await screen.findByLabelText('Name')
    for (const label of ['Name', 'Company', 'Phone', 'Address line 1', 'City', 'Country']) expect(screen.getByLabelText(label)).toBeInTheDocument()
    for (const label of ['Email', 'Tax ID', 'Notes', 'Active']) expect(screen.queryByLabelText(label)).toBeNull()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('sends only name, company_name, phone and address', async () => {
    const user = userEvent.setup()
    request.mockResolvedValueOnce(profile).mockResolvedValueOnce({ ...profile, phone: '+91 99999 88888' })
    wrap(<ProfilePage />)
    await user.type(await screen.findByLabelText('Phone'), '+91 99999 88888')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument()
    const [path, init] = request.mock.calls[1] ?? []
    expect(path).toBe('/me/profile')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(Object.keys(body).sort()).toEqual(['address', 'company_name', 'name', 'phone'])
    expect(body.phone).toBe('+91 99999 88888')
  })

  it('shows an error state with retry', async () => {
    request.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Customer profile required'))
    wrap(<ProfilePage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Customer profile required')
  })
})

describe('CustomerDetailPage', () => {
  const route = <Routes><Route path="/app/customers/:id" element={<CustomerDetailPage />} /></Routes>

  it('renders the profile plus clearly separated future sections without fabricating data', async () => {
    request.mockImplementation(async (path) => (path === '/auth/me' ? { id: 1, email: 'a@x.co', full_name: 'A', role: 'staff', customer_id: null } : detail()))
    wrap(route, '/app/customers/7')
    expect(await screen.findByLabelText('Customer profile')).toBeInTheDocument()
    for (const name of ['Subscriptions', 'Invoices', 'Outstanding amounts']) expect(screen.getByLabelText(name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull()
  })

  it('shows the deactivate control to admins only', async () => {
    request.mockImplementation(async (path) => (path === '/auth/me' ? { id: 1, email: 'a@x.co', full_name: 'A', role: 'admin', customer_id: null } : detail()))
    wrap(route, '/app/customers/7')
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })
})

describe('CustomerSelect', () => {
  it('debounces searches, does not load on idle, and returns id + customer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    request.mockImplementation(async (path) => (String(path).includes('q=an') ? page([item(1, 'Anna')]) : page([item(1, 'Anna'), item(2, 'Bob')])))
    wrap(<CustomerSelect value={null} onChange={onChange} debounceMs={300} />)
    expect(request).not.toHaveBeenCalled()

    await user.click(screen.getByRole('combobox', { name: 'Customer' }))
    await act(() => vi.advanceTimersByTimeAsync(350))
    await screen.findByText('Bob')
    request.mockClear()

    await user.type(screen.getByRole('combobox'), 'an')
    expect(screen.getByText('Searching…')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(350))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(String(request.mock.calls[0]?.[0])).toBe('/customers?q=an&is_active=true&sort=name&page_size=10')
    await user.click(await screen.findByRole('option', { name: /Anna/ }))
    expect(onChange).toHaveBeenLastCalledWith(1, expect.objectContaining({ id: 1, name: 'Anna' }))
  })

  it('shows empty and error states with retry', async () => {
    const user = userEvent.setup()
    request.mockResolvedValueOnce(page([]))
    wrap(<CustomerSelect value={null} onChange={vi.fn()} debounceMs={0} />)
    await user.click(screen.getByRole('combobox'))
    expect(await screen.findByText('No customers match')).toBeInTheDocument()
    cleanup()

    request.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'down')).mockResolvedValueOnce(page([item(3, 'Cara')]))
    wrap(<CustomerSelect value={null} onChange={vi.fn()} debounceMs={0} />)
    await user.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search customers')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Cara')).toBeInTheDocument()
  })

  it('clears the selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    request.mockResolvedValue(page([]))
    wrap(<CustomerSelect value={4} initialLabel="Dina" onChange={onChange} />)
    expect(screen.getByRole('combobox')).toHaveValue('Dina')
    await user.click(screen.getByRole('button', { name: 'Clear customer' }))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })
})
