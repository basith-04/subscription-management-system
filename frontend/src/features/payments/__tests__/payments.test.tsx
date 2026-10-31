// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../../lib/api'
import { CustomerOutstandingSection } from '../../customers/components/CustomerDetailSections'
import { summarizeAllocations } from '../allocation'
import { AllocationEditor } from '../components/AllocationEditor'
import { PaymentsPanel } from '../components/PaymentsPanel'
import { RecordPaymentDialog } from '../components/RecordPaymentDialog'
import { todayLocal } from '../dates'
import { VoidPaymentDialog } from '../components/VoidPaymentDialog'
import { sumAmounts } from '../money'
import { PaymentListPage } from '../pages/PaymentListPage'
import type { Payment } from '../types'

vi.mock('../../../lib/api', async (original) => {
  const actual = await original<typeof import('../../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
const request = vi.mocked(apiRequest)
afterEach(() => { cleanup(); vi.resetAllMocks() })

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 5, customer: { id: 9, name: 'Alice' }, method: 'bank_transfer', amount: '40.00', payment_date: '2026-11-01', note: null, reference_number: 'TXN-1',
  source: 'manual', is_voided: false, voided_at: null, void_reason: null, recorded_by: 1, created_at: '2026-11-01T00:00:00Z',
  allocations: [{ invoice_id: 7, invoice_number: 'INV-000007', amount: '40.00' }], ...over,
})
const result = (over = {}) => ({ ...payment(), invoices: [{ id: 7, number: 'INV-000007', status: 'confirmed', payment_state: 'partially_paid', amount_paid: '40.00', amount_due: '60.00' }], ...over })
const invoice = { id: 7, number: 'INV-000007', customerId: 9, amountDue: '100.00' }

function wrap(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>) }
}
const postedBody = () => JSON.parse(String(request.mock.calls.find((c) => String(c[0]) === '/payments')?.[1]?.body))
const SearchEcho = () => <output data-testid="loc">{useLocation().search}</output>

describe('decimal helpers and allocation maths', () => {
  it('0.10 + 0.20 = 0.30 exactly', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30')
    expect(sumAmounts(['0.10', 'abc', '1.5'])).toBe('1.60') // invalid entries ignored; 1.5 → 1.50
  })
  const row = (id: number, due: string, amount: string) => ({ invoice_id: id, invoice_number: `INV-${id}`, amount_due: due, amount })
  it('computes allocated / unallocated and flags overruns', () => {
    const ok = summarizeAllocations('150.00', [row(1, '100.00', '100.00'), row(2, '60.00', '30.00')])
    expect(ok).toMatchObject({ allocated: '130.00', unallocated: '20.00', valid: true, totalError: null })
    expect(summarizeAllocations('100.00', [row(1, '100.00', '100.01')]).rowErrors[1]).toMatch(/Cannot exceed/)
    expect(summarizeAllocations('100.00', [row(1, '100.00', '60.00'), row(2, '100.00', '60.00')]).totalError).toBe('Allocations exceed the payment amount')
    expect(summarizeAllocations('100.00', [row(1, '100.00', '0.00')]).valid).toBe(false)
    expect(summarizeAllocations('100.00', [row(1, '100.00', '1.001')]).valid).toBe(false)
  })
})

describe('RecordPaymentDialog', () => {
  const open = (onRecorded = vi.fn(), onClose = vi.fn()) => wrap(<RecordPaymentDialog invoice={invoice} onClose={onClose} onRecorded={onRecorded} />)

  it('defaults amount to amount_due, date to today and allocates the invoice in full', () => {
    open()
    expect(screen.getByLabelText('Amount')).toHaveValue('100.00')
    expect(screen.getByLabelText('Payment date')).toHaveValue(todayLocal())
    expect(screen.getByLabelText('Payment date')).toHaveAttribute('max', todayLocal())
    expect(screen.getByLabelText('Allocate to INV-000007')).toHaveValue('100.00')
    expect(screen.getByTestId('unallocated')).toHaveTextContent('0.00')
  })

  it('requires a method, a positive amount and rejects future dates without calling the API', async () => {
    const u = userEvent.setup()
    open()
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Select a payment method')).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.clear(screen.getByLabelText('Amount')); await u.type(screen.getByLabelText('Amount'), '1.001')
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText(/greater than zero with at most 2 decimals/)).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Amount')); await u.type(screen.getByLabelText('Amount'), '10.00')
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const future = todayLocal(tomorrow)
    await u.clear(screen.getByLabelText('Payment date')); await u.type(screen.getByLabelText('Payment date'), future)
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Payment date cannot be in the future')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('submits the documented payload and reports the result', async () => {
    const u = userEvent.setup()
    const onRecorded = vi.fn()
    request.mockResolvedValue(result())
    open(onRecorded)
    await u.selectOptions(screen.getByLabelText('Method'), 'bank_transfer')
    await u.clear(screen.getByLabelText('Amount')); await u.type(screen.getByLabelText('Amount'), '40.00')
    await u.type(screen.getByLabelText('Reference number (optional)'), ' TXN-1 ')
    await u.type(screen.getByLabelText('Note (optional)'), 'part 1')
    expect(screen.getByLabelText('Allocate to INV-000007')).toHaveValue('40.00') // follows the amount
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(onRecorded).toHaveBeenCalled())
    expect(postedBody()).toEqual({ method: 'bank_transfer', amount: '40.00', payment_date: todayLocal(), reference_number: 'TXN-1', note: 'part 1', allocations: [{ invoice_id: 7, amount: '40.00' }] })
  })

  it('caps the single allocation at the invoice balance when the amount is larger', async () => {
    const u = userEvent.setup()
    open()
    await u.clear(screen.getByLabelText('Amount')); await u.type(screen.getByLabelText('Amount'), '250.00')
    expect(screen.getByLabelText('Allocate to INV-000007')).toHaveValue('100.00')
    expect(screen.getByTestId('unallocated')).toHaveTextContent('150.00')
  })

  it('blocks an allocation above the invoice balance and above the payment amount (live)', async () => {
    const u = userEvent.setup()
    open()
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.clear(screen.getByLabelText('Allocate to INV-000007')); await u.type(screen.getByLabelText('Allocate to INV-000007'), '100.50')
    expect(screen.getByText(/Cannot exceed the 100.00 due/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(request).not.toHaveBeenCalled()
    await u.clear(screen.getByLabelText('Amount')); await u.type(screen.getByLabelText('Amount'), '50.00')
    await u.clear(screen.getByLabelText('Allocate to INV-000007')); await u.type(screen.getByLabelText('Allocate to INV-000007'), '60.00')
    expect(screen.getByText('Allocations exceed the payment amount')).toBeInTheDocument()
  })

  it('disables submit while pending and ignores repeated clicks', async () => {
    const u = userEvent.setup()
    let done!: (v: unknown) => void
    request.mockImplementation(() => new Promise((r) => { done = r }))
    open()
    await u.selectOptions(screen.getByLabelText('Method'), 'upi')
    const submit = screen.getByRole('button', { name: 'Record payment' })
    await u.click(submit)
    const busy = await screen.findByRole('button', { name: 'Recording…' })
    expect(busy).toBeDisabled()
    await u.click(busy); await u.dblClick(busy)
    done(result())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  })

  it('shows 422 allocation errors next to the row and a 409 duplicate reference next to the field', async () => {
    const u = userEvent.setup()
    request.mockRejectedValueOnce(new ApiError(422, 'ALLOCATION_EXCEEDS_AMOUNT_DUE', 'Amount exceeds the 60.00 due', [{ field: 'allocations.0.amount', message: 'Amount exceeds the 60.00 due on invoice INV-000007' }]))
    open()
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Amount exceeds the 60.00 due on invoice INV-000007')).toBeInTheDocument()
    request.mockRejectedValueOnce(new ApiError(409, 'DUPLICATE_PAYMENT_REFERENCE', 'dup', [{ field: 'reference_number', message: 'This reference has already been recorded' }]))
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('This reference has already been recorded')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference number (optional)')).toBeInTheDocument()
  })

  it('offers "Record anyway" for a suspected duplicate and resends with confirm_duplicate', async () => {
    const u = userEvent.setup()
    request.mockRejectedValueOnce(new ApiError(409, 'POSSIBLE_DUPLICATE_PAYMENT', 'An identical payment was recorded in the last 60 seconds.'))
    request.mockResolvedValueOnce(result())
    const onRecorded = vi.fn()
    open(onRecorded)
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    await u.click(await screen.findByRole('button', { name: 'Record anyway' }))
    await waitFor(() => expect(onRecorded).toHaveBeenCalled())
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body)).confirm_duplicate).toBe(true)
  })

  it('shows a state conflict (409) as a form error', async () => {
    const u = userEvent.setup()
    request.mockRejectedValue(new ApiError(409, 'INVALID_STATE_TRANSITION', 'Invoice INV-000007 is paid; only confirmed invoices can receive payments'))
    open()
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText(/only confirmed invoices can receive payments/)).toBeInTheDocument()
  })
})

describe('AllocationEditor', () => {
  it('offers only the same customer’s open invoices and adds them', async () => {
    const u = userEvent.setup()
    const onChange = vi.fn()
    request.mockResolvedValue({ data: [
      { id: 7, number: 'INV-000007', status: 'confirmed', amount_due: '100.00' },
      { id: 8, number: 'INV-000008', status: 'confirmed', amount_due: '25.00' },
    ], meta: {} })
    wrap(<AllocationEditor customerId={9} paymentAmount="125.00" lockedInvoiceId={7} onChange={onChange}
      rows={[{ invoice_id: 7, invoice_number: 'INV-000007', amount_due: '100.00', amount: '100.00' }]} />)
    await u.click(screen.getByRole('button', { name: /Also pay another invoice/ }))
    expect(String(request.mock.calls[0]?.[0])).toContain('customer_id=9')
    const select = await screen.findByLabelText('Add invoice')
    expect(within(select).queryByText(/INV-000007/)).not.toBeInTheDocument() // already allocated
    await u.selectOptions(select, '8')
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ invoice_id: 8, amount: '25.00' })]))
  })
  it('does not let the opening invoice be removed', () => {
    wrap(<AllocationEditor customerId={9} paymentAmount="10.00" lockedInvoiceId={7} onChange={vi.fn()}
      rows={[{ invoice_id: 7, invoice_number: 'INV-000007', amount_due: '100.00', amount: '10.00' }, { invoice_id: 8, invoice_number: 'INV-000008', amount_due: '5.00', amount: '5.00' }]} />)
    expect(screen.queryByRole('button', { name: 'Remove INV-000007' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove INV-000008' })).toBeInTheDocument()
  })
})

describe('PaymentsPanel (invoice detail)', () => {
  const panel = (role: 'admin' | 'staff', status = 'confirmed', amountDue = '100.00') => {
    request.mockImplementation(async (path, opts) => {
      const p = String(path)
      if (p === '/auth/me') return { id: 1, email: 'a@b.c', full_name: 'T', role, customer_id: null }
      if (p === '/invoices/7/payments') return [payment(), payment({ id: 6, is_voided: true, void_reason: 'typo', amount: '10.00', reference_number: null })]
      if (p === '/payments' && opts?.method === 'POST') return result()
      return { data: [], meta: {} }
    })
    return wrap(<PaymentsPanel invoice={{ id: 7, number: 'INV-000007', status, customerId: 9, amountDue }} />)
  }

  it('lists history with method, amount, date, reference, allocations and voided status', async () => {
    panel('staff')
    const table = await screen.findByRole('table', { name: 'Payment history' })
    expect(table).toHaveTextContent('Bank transfer'); expect(table).toHaveTextContent('2026-11-01'); expect(table).toHaveTextContent('TXN-1')
    expect(table).toHaveTextContent('INV-000007 (40.00)'); expect(table).toHaveTextContent('Voided')
  })
  it('shows Record payment only for confirmed invoices with a balance', async () => {
    panel('staff'); await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    cleanup(); request.mockReset(); panel('staff', 'paid', '0.00'); await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument()
  })
  it('Void is Admin-only and only for non-voided payments', async () => {
    panel('staff'); await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /Void payment/ })).not.toBeInTheDocument()
    cleanup(); request.mockReset(); panel('admin'); await screen.findByRole('table')
    expect(screen.getAllByRole('button', { name: /^Void payment/ })).toHaveLength(1)
  })
  it('refreshes payments and invoices after recording and names the invoice in the toast', async () => {
    const u = userEvent.setup()
    const { client } = panel('staff')
    const spy = vi.spyOn(client, 'invalidateQueries')
    await screen.findByRole('table')
    await u.click(screen.getByRole('button', { name: 'Record payment' }))
    await u.selectOptions(screen.getByLabelText('Method'), 'cash')
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Payment recorded for INV-000007.')).toBeInTheDocument()
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['payments', 'invoices', 'customers', 'dashboard']))
  })
  it('shows empty and error states', async () => {
    request.mockImplementation(async (p) => { if (String(p) === '/auth/me') return { role: 'staff' }; return [] })
    wrap(<PaymentsPanel invoice={{ id: 7, number: 'INV-000007', status: 'confirmed', customerId: 9, amountDue: '1.00' }} />)
    expect(await screen.findByText('No payments recorded yet.')).toBeInTheDocument()
    cleanup(); request.mockReset()
    request.mockImplementation(async (p) => { if (String(p) === '/auth/me') return { role: 'staff' }; throw new ApiError(500, 'X', 'down') })
    wrap(<PaymentsPanel invoice={{ id: 7, number: 'INV-000007', status: 'confirmed', customerId: 9, amountDue: '1.00' }} />)
    expect(await screen.findByText('Unable to load payments.')).toBeInTheDocument()
  })
})

describe('VoidPaymentDialog', () => {
  it('shows the payment, warns about the reversal and requires a reason and explicit confirmation', async () => {
    const u = userEvent.setup()
    const onVoided = vi.fn()
    request.mockResolvedValue(result())
    wrap(<VoidPaymentDialog payment={payment()} onClose={vi.fn()} onVoided={onVoided} />)
    expect(screen.getByText(/reverses this payment's effect on every invoice/)).toBeInTheDocument()
    expect(screen.getByText('INV-000007')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Void payment' }))
    expect(await screen.findByText('A void reason is required')).toBeInTheDocument()
    await u.type(screen.getByLabelText('Reason (required)'), 'wrong customer')
    await u.click(screen.getByRole('button', { name: 'Void payment' }))
    expect(screen.getByText('Confirm that you want to void this payment')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
    await u.click(screen.getByLabelText(/I understand/))
    await u.click(screen.getByRole('button', { name: 'Void payment' }))
    await waitFor(() => expect(onVoided).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith('/payments/5/void', expect.objectContaining({ body: JSON.stringify({ reason: 'wrong customer' }) }))
  })
  it('shows a server conflict such as an already voided payment', async () => {
    const u = userEvent.setup()
    request.mockRejectedValue(new ApiError(409, 'INVALID_STATE_TRANSITION', 'This payment has already been voided'))
    wrap(<VoidPaymentDialog payment={payment()} onClose={vi.fn()} onVoided={vi.fn()} />)
    await u.type(screen.getByLabelText('Reason (required)'), 'x'); await u.click(screen.getByLabelText(/I understand/))
    await u.click(screen.getByRole('button', { name: 'Void payment' }))
    expect(await screen.findByText('This payment has already been voided')).toBeInTheDocument()
  })
})

describe('PaymentListPage', () => {
  const page = { data: [payment(), payment({ id: 6, is_voided: true, void_reason: 'typo' })], meta: { page: 1, page_size: 20, total: 2, total_pages: 1 } }
  it('reads filters from the URL, shows allocations and voided status', async () => {
    request.mockResolvedValue(page)
    wrap(<PaymentListPage />, '/?method=cash&customer_id=9&invoice_id=7&date_from=2026-11-01&voided=false&q=txn&sort=-amount&page=2')
    await screen.findByRole('table', { name: 'Payments' })
    const call = String(request.mock.calls.at(-1)?.[0])
    for (const part of ['method=cash', 'customer_id=9', 'invoice_id=7', 'date_from=2026-11-01', 'voided=false', 'q=txn', 'sort=-amount', 'page=2']) expect(call).toContain(part)
    expect(screen.getAllByText('Voided', { selector: '.payment-badge' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'INV-000007' })[0]).toHaveAttribute('href', '/app/invoices/7')
  })
  it('Apply writes filters to the URL; empty and error states render', async () => {
    const u = userEvent.setup()
    request.mockResolvedValue(page)
    wrap(<><PaymentListPage /><SearchEcho /></>)
    await screen.findByRole('table')
    await u.type(screen.getByLabelText('Search'), 'abc'); await u.selectOptions(screen.getByLabelText('Method'), 'upi'); await u.selectOptions(screen.getByLabelText('Status'), 'true')
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('q=abc'))
    expect(screen.getByTestId('loc').textContent).toContain('method=upi'); expect(screen.getByTestId('loc').textContent).toContain('voided=true')
    cleanup(); request.mockReset()
    request.mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 0 } })
    wrap(<PaymentListPage />)
    expect(await screen.findByText('No payments match these filters.')).toBeInTheDocument()
    cleanup(); request.mockReset(); request.mockRejectedValue(new ApiError(500, 'X', 'down'))
    wrap(<PaymentListPage />)
    expect(await screen.findByText('Unable to load payments.')).toBeInTheDocument()
  })
})

describe('Customer outstanding section', () => {
  it('shows total outstanding and overdue with links to the open invoices', async () => {
    request.mockResolvedValue({ data: [{ id: 7, number: 'INV-000007', due_date: '2026-10-01', payment_state: 'overdue', amount_due: '60.00' }], meta: {} })
    wrap(<CustomerOutstandingSection customerId={9} outstanding="160.00" overdue="60.00" />)
    expect(screen.getByTestId('outstanding-total')).toHaveTextContent('160.00')
    expect(screen.getByTestId('overdue-total')).toHaveTextContent('60.00')
    expect(await screen.findByRole('link', { name: 'INV-000007' })).toHaveAttribute('href', '/app/invoices/7')
    expect(screen.getByText('Overdue', { selector: '.payment-badge' })).toBeInTheDocument()
  })
  it('handles unavailable totals and no unpaid invoices', async () => {
    wrap(<CustomerOutstandingSection customerId={9} outstanding={null} overdue={null} />)
    expect(screen.getByText(/not available yet/)).toBeInTheDocument()
    cleanup()
    request.mockResolvedValue({ data: [], meta: {} })
    wrap(<CustomerOutstandingSection customerId={9} outstanding="0.00" overdue="0.00" />)
    expect(await screen.findByText('No unpaid invoices.')).toBeInTheDocument()
  })
})
