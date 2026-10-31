// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../../lib/api'
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { Money } from '../components/Money'
import { formatMoney } from '../formatMoney'
import { PaymentStateBadge } from '../components/PaymentStateBadge'
import { SendInvoiceDialog } from '../components/SendInvoiceDialog'
import { InvoiceDetailPage } from '../pages/InvoiceDetailPage'
import { InvoiceListPage } from '../pages/InvoiceListPage'
import { InvoicePrintPage } from '../pages/InvoicePrintPage'
import type { InvoiceDetail, InvoiceListItem, PaymentState } from '../types'

vi.mock('../../../lib/api', async (original) => {
  const actual = await original<typeof import('../../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
const request = vi.mocked(apiRequest)

afterEach(() => { cleanup(); vi.resetAllMocks() })

const summary = { count: 3, total: '1500.00', amount_paid: '200.00', amount_due: '1300.00' }
const row = (id: number, over: Partial<InvoiceListItem> = {}): InvoiceListItem => ({
  id, number: `INV-00000${id}`, customer: { id: 9, name: `Customer ${id}` }, subscription_id: 5, status: 'draft', payment_state: 'draft',
  issue_date: '2026-11-01', due_date: '2026-11-16', total: '500.00', amount_paid: '0.00', amount_due: '500.00', sent_at: null, ...over,
})
const listResult = (rows: InvoiceListItem[], meta = {}) => ({ data: rows, meta: { page: 1, page_size: 20, total: rows.length, total_pages: 1, summary, ...meta } })

const detail = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: 7, number: 'INV-000007', status: 'confirmed', payment_state: 'outstanding',
  subscription: { id: 5, number: 'SUB-000005' }, billing_run_id: null,
  customer: { id: 9, name: 'Snapshot Name Ltd', email: 'billing@snapshot.test', tax_id: 'GST-77', billing_address: { line1: '1 Old Street', city: 'Kochi' } },
  period_start: '2026-11-01', period_end: '2026-11-30', issue_date: '2026-11-01', due_date: '2026-11-16', payment_term: 'Net 15', notes: 'Pay by transfer',
  items: [{ id: 1, description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', line_subtotal: '7800.00', discount_amount: '780.00', taxable_amount: '7020.00', tax_name: 'GST 18%', tax_rate: '18.000', tax_amount: '1263.60', line_total: '8283.60' }],
  tax_details: [{ tax_name: 'GST 18%', tax_rate: '18.000', taxable_amount: '7020.00', tax_amount: '1263.60' }],
  subtotal: '7800.00', discount_total: '780.00', tax_total: '1263.60', total: '8283.60', amount_paid: '0.00', amount_due: '8283.60',
  confirmed_at: '2026-11-01T00:00:00Z', paid_at: null, cancelled_at: null, cancel_reason: null, sent_at: null, created_at: '2026-11-01T00:00:00Z',
  can_edit: false, can_confirm: false, can_cancel: true, can_send: true, ...over,
})

const user = (role: 'admin' | 'staff') => ({ id: 1, email: 'x@y.z', full_name: 'Tester', role, customer_id: null })

function wrap(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>)
}
const SearchEcho = () => <output data-testid="loc">{useLocation().search}</output>
const calls = () => request.mock.calls.map((c) => String(c[0]))
const lastListCall = () => calls().filter((c) => c.startsWith('/invoices?')).at(-1) ?? ''

describe('PaymentStateBadge / Money', () => {
  it.each<[PaymentState, string]>([
    ['draft', 'Draft'], ['not_due', 'Not yet due'], ['outstanding', 'Outstanding'], ['partially_paid', 'Partially paid'],
    ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled'],
  ])('renders %s with a text label and state class', (state, label) => {
    render(<PaymentStateBadge state={state} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-state', state)
    expect(badge).toHaveClass(`payment-badge--${state}`)
  })

  it('formats money strings without converting to numbers', () => {
    expect(formatMoney('1234567.80')).toBe('1,234,567.80')
    expect(formatMoney('0.10')).toBe('0.10')
    expect(formatMoney('99999999999999999.99')).toBe('99,999,999,999,999,999.99') // beyond float precision
    render(<Money value="1560.00" currency="INR" />)
    expect(screen.getByText('INR 1,560.00')).toBeInTheDocument()
  })
})

describe('InvoiceListPage', () => {
  beforeEach(() => {
    request.mockResolvedValue(listResult([
      row(1), row(2), row(3, { status: 'confirmed', payment_state: 'overdue' }),
    ]))
  })

  it('reads filters, sort and page from the URL and sends them to the API', async () => {
    wrap(<InvoiceListPage />, '/app/invoices?status=confirmed&payment_state=overdue&q=acme&min_total=10.00&customer_id=9&subscription_id=5&due_to=2026-12-31&sort=-total&page=2')
    await screen.findByText('INV-000001')
    const call = lastListCall()
    for (const part of ['status=confirmed', 'payment_state=overdue', 'q=acme', 'min_total=10.00', 'customer_id=9', 'subscription_id=5', 'due_to=2026-12-31', 'sort=-total', 'page=2']) {
      expect(call).toContain(part)
    }
    expect(screen.getByLabelText('Search')).toHaveValue('acme')
  })

  it('defaults to newest-issued page 1 with no filters', async () => {
    wrap(<InvoiceListPage />)
    await screen.findByText('INV-000001')
    expect(lastListCall()).toBe('/invoices?sort=-issue_date&page=1')
  })

  it('shows the summary strip for the current filters', async () => {
    wrap(<InvoiceListPage />)
    const strip = await screen.findByLabelText('Summary for current filters')
    expect(within(strip).getByTestId('summary-count')).toHaveTextContent('3')
    expect(strip).toHaveTextContent('1,500.00')
    expect(strip).toHaveTextContent('200.00')
    expect(strip).toHaveTextContent('1,300.00')
  })

  it('tabs write URL filters and mark the active tab', async () => {
    const u = userEvent.setup()
    wrap(<><InvoiceListPage /><SearchEcho /></>)
    await screen.findByText('INV-000001')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-current', 'page')
    await u.click(screen.getByRole('button', { name: 'Overdue' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('payment_state=overdue'))
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-current', 'page')
    await u.click(screen.getByRole('button', { name: 'Paid' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('status=paid'))
    expect(screen.getByTestId('loc').textContent).not.toContain('payment_state')
    await u.click(screen.getByRole('button', { name: 'Outstanding' }))
    await waitFor(() => expect(decodeURIComponent(screen.getByTestId('loc').textContent ?? '')).toContain('payment_state=not_due,outstanding,partially_paid,overdue'))
    await u.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).not.toMatch(/status|payment_state/))
  })

  it('Apply writes the filter form to the URL; Clear removes it', async () => {
    const u = userEvent.setup()
    wrap(<><InvoiceListPage /><SearchEcho /></>, '/?page=3')
    await screen.findByText('INV-000001')
    await u.type(screen.getByLabelText('Search'), 'INV-9')
    await u.type(screen.getByLabelText('Min total'), '100')
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('q=INV-9'))
    expect(screen.getByTestId('loc').textContent).toContain('min_total=100')
    expect(screen.getByTestId('loc').textContent).not.toContain('page=3') // filter change resets paging
    await u.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).not.toContain('q='))
  })

  it('paginates through the URL', async () => {
    request.mockResolvedValue(listResult([row(1)], { page: 1, total: 45, total_pages: 3 }))
    const u = userEvent.setup()
    wrap(<><InvoiceListPage /><SearchEcho /></>)
    await screen.findByText('Page 1 of 3')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=2'))
  })

  it('shows loading, an empty state with a clear action, and an error with retry', async () => {
    request.mockResolvedValueOnce(listResult([], { total: 0, summary: { count: 0, total: '0.00', amount_paid: '0.00', amount_due: '0.00' } }))
    wrap(<InvoiceListPage />, '/?q=zzz')
    expect(screen.getByText('Loading invoices…')).toBeInTheDocument()
    expect(await screen.findByText('No invoices match these filters.')).toBeInTheDocument()
    cleanup()

    request.mockReset()
    request.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'down')).mockResolvedValue(listResult([row(1)]))
    const u = userEvent.setup()
    wrap(<InvoiceListPage />)
    expect(await screen.findByText('Unable to load invoices.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('INV-000001')).toBeInTheDocument()
  })

  it('only drafts are selectable', async () => {
    wrap(<InvoiceListPage />)
    await screen.findByText('INV-000001')
    expect(screen.getByLabelText('Select INV-000001')).toBeInTheDocument()
    expect(screen.queryByLabelText('Select INV-000003')).not.toBeInTheDocument() // overdue confirmed invoice
  })

  describe('bulk confirmation', () => {
    it('confirms selected drafts once and shows per-invoice success and failure', async () => {
      const u = userEvent.setup()
      let release!: () => void
      request.mockImplementation(async (path, opts) => {
        if (String(path) === '/invoices/bulk-confirm') {
          expect(JSON.parse(String(opts?.body))).toEqual({ invoice_ids: [1, 2] })
          await new Promise<void>((r) => { release = r })
          return { confirmed: [1], failed: [{ id: 2, code: 'INVALID_STATE_TRANSITION' }] }
        }
        return listResult([row(1), row(2)])
      })
      wrap(<InvoiceListPage />)
      await screen.findByText('INV-000001')
      await u.click(screen.getByLabelText('Select all drafts on this page'))
      expect(screen.getByText('2 drafts selected')).toBeInTheDocument()
      await u.click(screen.getByRole('button', { name: 'Confirm selected' }))
      const dialog = screen.getByRole('dialog')
      await u.click(within(dialog).getByRole('button', { name: 'Confirm selected' }))

      // while in flight the trigger is disabled → no duplicate submission
      const busy = await screen.findByRole('button', { name: 'Confirming…' })
      expect(busy).toBeDisabled()
      await u.click(busy)
      release()

      const result = await screen.findByLabelText('Bulk confirmation result')
      expect(result).toHaveTextContent('1 confirmed, 1 failed')
      expect(result).toHaveTextContent('INV-000001: confirmed')
      expect(result).toHaveTextContent('INV-000002: INVALID_STATE_TRANSITION')
      expect(calls().filter((c) => c === '/invoices/bulk-confirm')).toHaveLength(1)
      expect(screen.queryByText(/drafts? selected/)).not.toBeInTheDocument()
    })
  })
})

describe('InvoiceDetailPage actions per status and role', () => {
  function mount(inv: InvoiceDetail, role: 'admin' | 'staff' = 'staff') {
    request.mockImplementation(async (path) => {
      if (String(path) === '/auth/me') return user(role)
      if (String(path) === `/invoices/${inv.id}`) return inv
      throw new Error(`unexpected ${String(path)}`)
    })
    return wrap(<Routes><Route path="/app/invoices/:id" element={<InvoiceDetailPage />} /></Routes>, `/app/invoices/${inv.id}`)
  }
  const buttons = () => screen.getAllByRole('button').map((b) => b.textContent)
  const toolbar = () => within(screen.getByRole('toolbar', { name: 'Invoice actions' }))

  it('draft: Confirm, Print, Cancel and the draft editor; no Send', async () => {
    mount(detail({ status: 'draft', payment_state: 'draft', can_edit: true, can_confirm: true, can_send: false }))
    await screen.findByRole('heading', { name: 'Invoice INV-000007' })
    expect(toolbar().getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(toolbar().getByRole('button', { name: 'Cancel invoice' })).toBeInTheDocument()
    expect(toolbar().queryByRole('button', { name: /Send/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Edit draft' })).toBeInTheDocument()
  })

  it('confirmed (unpaid): Send, Print, Cancel; no Confirm, no editor', async () => {
    mount(detail())
    await screen.findByRole('heading', { name: 'Invoice INV-000007' })
    expect(toolbar().getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(toolbar().getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(toolbar().getByRole('button', { name: 'Cancel invoice' })).toBeInTheDocument()
    expect(toolbar().queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Edit draft' })).not.toBeInTheDocument()
    expect(buttons()).not.toContain('Remove')
  })

  it('paid: Send and Print only', async () => {
    mount(detail({ status: 'paid', payment_state: 'paid', amount_paid: '8283.60', amount_due: '0.00', can_cancel: false }))
    await screen.findByRole('heading', { name: 'Invoice INV-000007' })
    expect(toolbar().getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(toolbar().queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
    expect(toolbar().queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('cancelled: Print only, with the cancellation reason', async () => {
    mount(detail({ status: 'cancelled', payment_state: 'cancelled', can_cancel: false, can_send: false, cancel_reason: 'Duplicate bill' }))
    await screen.findByRole('heading', { name: 'Invoice INV-000007' })
    expect(toolbar().getAllByRole('button').map((b) => b.textContent)).toEqual(['Print'])
    expect(screen.getByText(/Cancelled: Duplicate bill/)).toBeInTheDocument()
  })

  it('partially paid: no Cancel; Staff is told to ask an Admin, Admin to void the payment', async () => {
    const partly = detail({ payment_state: 'partially_paid', amount_paid: '100.00', amount_due: '8183.60', can_cancel: false })
    mount(partly, 'staff')
    expect(await screen.findByTestId('cancel-blocked')).toHaveTextContent('Ask an Admin to void the payment first')
    expect(toolbar().queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
    cleanup(); request.mockReset()
    mount(partly, 'admin')
    await waitFor(() => expect(screen.getByTestId('cancel-blocked')).toHaveTextContent('Void the payment first, then cancel it'))
  })

  it('shows the invoice snapshot, tax summary, totals, amounts and the F13/F15 slots', async () => {
    mount(detail({ amount_paid: '83.60', amount_due: '8200.00', payment_state: 'partially_paid' }))
    await screen.findByRole('heading', { name: 'Invoice INV-000007' })
    const doc = screen.getByLabelText('Invoice INV-000007')
    for (const text of ['Snapshot Name Ltd', 'billing@snapshot.test', 'GST-77', '1 Old Street', 'Kochi', 'Net 15', '2026-11-01 to 2026-11-30', 'SUB-000005',
      'Platform – Brand: Odoo', '7,800.00', '780.00', '1,263.60', '8,283.60', '83.60', '8,200.00', 'Partially paid', 'Pay by transfer']) {
      expect(doc, text).toHaveTextContent(text)
    }
    const slots = document.querySelectorAll('[data-slot]')
    expect([...slots].map((s) => s.getAttribute('data-slot'))).toEqual(['payments', 'discount'])
  })

  it('confirming refreshes the detail; a 409 shows a clear banner', async () => {
    const u = userEvent.setup()
    let current = detail({ status: 'draft', payment_state: 'draft', can_edit: true, can_confirm: true, can_send: false })
    let confirmError: ApiError | null = null
    request.mockImplementation(async (path) => {
      const p = String(path)
      if (p === '/auth/me') return user('staff')
      if (p === '/invoices/7/confirm') {
        if (confirmError) { current = detail({ status: 'cancelled', payment_state: 'cancelled', can_confirm: false, can_cancel: false, can_send: false, cancel_reason: 'raced' }); throw confirmError }
        current = detail(); return current
      }
      if (p === '/invoices/7') return current
      throw new Error(`unexpected ${p}`)
    })
    wrap(<Routes><Route path="/app/invoices/:id" element={<InvoiceDetailPage />} /></Routes>, '/app/invoices/7')
    await u.click(await screen.findByRole('button', { name: 'Confirm' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm invoice' }))
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument() // refreshed to confirmed
    expect(screen.getByText('Invoice INV-000007 confirmed.')).toBeInTheDocument()

    cleanup(); request.mockReset()
    current = detail({ status: 'draft', payment_state: 'draft', can_edit: true, can_confirm: true, can_send: false })
    confirmError = new ApiError(409, 'INVALID_STATE_TRANSITION', 'Cannot move an invoice from cancelled to confirmed')
    request.mockImplementation(async (path) => {
      const p = String(path)
      if (p === '/auth/me') return user('staff')
      if (p === '/invoices/7/confirm') { current = detail({ status: 'cancelled', payment_state: 'cancelled', can_confirm: false, can_cancel: false, can_send: false, cancel_reason: 'raced' }); throw confirmError }
      return current
    })
    wrap(<Routes><Route path="/app/invoices/:id" element={<InvoiceDetailPage />} /></Routes>, '/app/invoices/7')
    await u.click(await screen.findByRole('button', { name: 'Confirm' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm invoice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot move an invoice from cancelled to confirmed')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()) // refetched
  })

  it('shows not-found and retryable error states', async () => {
    request.mockImplementation(async () => { throw new ApiError(404, 'NOT_FOUND', 'Invoice not found') })
    wrap(<Routes><Route path="/app/invoices/:id" element={<InvoiceDetailPage />} /></Routes>, '/app/invoices/99')
    expect(await screen.findByText('Invoice not found.')).toBeInTheDocument()
  })
})

describe('SendInvoiceDialog', () => {
  const props = { invoiceId: 7, invoiceNumber: 'INV-000007', defaultEmail: 'billing@snapshot.test' }

  it('defaults to the customer email and sends without overriding the recipient', async () => {
    const u = userEvent.setup()
    const onSent = vi.fn()
    request.mockResolvedValue({ ...detail(), sent_to: 'billing@snapshot.test' })
    wrap(<SendInvoiceDialog {...props} onClose={vi.fn()} onSent={onSent} />)
    expect(screen.getByLabelText('Recipient')).toHaveValue('billing@snapshot.test')
    await u.type(screen.getByLabelText('Message (optional)'), 'Thanks!')
    await u.click(screen.getByRole('button', { name: 'Send invoice' }))
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('billing@snapshot.test'))
    expect(request).toHaveBeenCalledWith('/invoices/7/send', expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'Thanks!' }) }))
  })

  it('sends a custom recipient', async () => {
    const u = userEvent.setup()
    request.mockResolvedValue({ ...detail(), sent_to: 'cfo@other.test' })
    wrap(<SendInvoiceDialog {...props} onClose={vi.fn()} onSent={vi.fn()} />)
    await u.clear(screen.getByLabelText('Recipient'))
    await u.type(screen.getByLabelText('Recipient'), 'cfo@other.test')
    await u.click(screen.getByRole('button', { name: 'Send invoice' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/invoices/7/send', expect.objectContaining({ body: JSON.stringify({ to: 'cfo@other.test' }) })))
  })

  it('validates the recipient and message length before calling the API', async () => {
    const u = userEvent.setup()
    wrap(<SendInvoiceDialog {...props} onClose={vi.fn()} onSent={vi.fn()} />)
    await u.clear(screen.getByLabelText('Recipient'))
    await u.type(screen.getByLabelText('Recipient'), 'not-an-email')
    await u.click(screen.getByRole('button', { name: 'Send invoice' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Recipient'))
    await u.type(screen.getByLabelText('Recipient'), 'a@b.co, c@d.co')
    await u.click(screen.getByRole('button', { name: 'Send invoice' }))
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('shows progress, blocks double submit and reports an email failure clearly', async () => {
    const u = userEvent.setup()
    let fail!: () => void
    request.mockImplementation(() => new Promise((_res, rej) => { fail = () => rej(new ApiError(502, 'EMAIL_FAILED', 'mail down')) }))
    const onSent = vi.fn()
    wrap(<SendInvoiceDialog {...props} onClose={vi.fn()} onSent={onSent} />)
    await u.click(screen.getByRole('button', { name: 'Send invoice' }))
    const sending = await screen.findByRole('button', { name: 'Sending…' })
    expect(sending).toBeDisabled()
    fail()
    expect(await screen.findByRole('alert')).toHaveTextContent('The email could not be sent. The invoice was not changed')
    expect(onSent).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Send invoice' })).toBeEnabled() // can retry
  })

  it('detail page toast names the recipient after a successful send', async () => {
    const u = userEvent.setup()
    request.mockImplementation(async (path) => {
      const p = String(path)
      if (p === '/auth/me') return user('staff')
      if (p === '/invoices/7/send') return { ...detail({ sent_at: '2026-11-02T10:00:00Z' }), sent_to: 'billing@snapshot.test' }
      return detail()
    })
    wrap(<Routes><Route path="/app/invoices/:id" element={<InvoiceDetailPage />} /></Routes>, '/app/invoices/7')
    await u.click(await screen.findByRole('button', { name: 'Send' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invoice' }))
    expect(await screen.findByText('Invoice INV-000007 sent to billing@snapshot.test.')).toBeInTheDocument()
  })
})

describe('CancelInvoiceDialog', () => {
  const props = { invoiceId: 7, invoiceNumber: 'INV-000007', status: 'confirmed' as const }

  it('explains the payment restriction and requires a reason', async () => {
    const u = userEvent.setup()
    const onCancelled = vi.fn()
    wrap(<CancelInvoiceDialog {...props} onClose={vi.fn()} onCancelled={onCancelled} />)
    expect(screen.getByText(/has any payment recorded cannot be cancelled/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    expect(await screen.findByText('A cancellation reason is required')).toBeInTheDocument()
    await u.type(screen.getByLabelText('Reason (required)'), '   ')
    await u.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    expect(screen.getByText('A cancellation reason is required')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('submits the trimmed reason', async () => {
    const u = userEvent.setup()
    const onCancelled = vi.fn()
    request.mockResolvedValue(detail({ status: 'cancelled' }))
    wrap(<CancelInvoiceDialog {...props} onClose={vi.fn()} onCancelled={onCancelled} />)
    await u.type(screen.getByLabelText('Reason (required)'), '  Billed twice ')
    await u.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    await waitFor(() => expect(onCancelled).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith('/invoices/7/cancel', expect.objectContaining({ body: JSON.stringify({ reason: 'Billed twice' }) }))
  })

  it('displays server-side state conflicts and notifies the page', async () => {
    const u = userEvent.setup()
    const onConflict = vi.fn()
    request.mockRejectedValue(new ApiError(409, 'INVALID_STATE_TRANSITION', 'Cannot move an invoice from confirmed to cancelled: Void the payment first, then cancel the invoice'))
    wrap(<CancelInvoiceDialog {...props} onClose={vi.fn()} onCancelled={vi.fn()} onConflict={onConflict} />)
    await u.type(screen.getByLabelText('Reason (required)'), 'oops')
    await u.click(screen.getByRole('button', { name: 'Cancel invoice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Void the payment first')
    expect(onConflict).toHaveBeenCalled()
  })
})

describe('InvoicePrintPage / InvoiceDocument', () => {
  it('renders the stored snapshot with no application chrome and opens the print dialog once', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    request.mockResolvedValue(detail())
    wrap(<InvoicePrintPage id={7} />)
    const doc = await screen.findByLabelText('Invoice INV-000007')
    expect(doc).toHaveTextContent('Snapshot Name Ltd')
    expect(doc).toHaveTextContent('8,283.60')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    print.mockRestore()
  })

  it('does not auto-print when disabled, and shows not-found cleanly', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    request.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Invoice not found'))
    wrap(<InvoicePrintPage id={99} autoPrint={false} />)
    expect(await screen.findByText('Invoice not found.')).toBeInTheDocument()
    expect(print).not.toHaveBeenCalled()
    print.mockRestore()
  })

  it('escapes hostile snapshot text (renders it as text, never as markup)', () => {
    const hostile = detail({
      customer: { id: 1, name: '<img src=x onerror=alert(1)>', email: 'a@b.co', tax_id: '<script>x()</script>', billing_address: { line1: '<b>bold</b>' } },
      notes: '<iframe src=//evil></iframe>',
      items: [{ ...detail().items[0]!, description: '</td><script>y()</script>' }],
    })
    const { container } = render(<InvoiceDocument invoice={hostile} />)
    expect(container.querySelector('script, img, iframe, b')).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  it('marks draft and cancelled documents', () => {
    const { rerender } = render(<InvoiceDocument invoice={detail({ status: 'draft', payment_state: 'draft' })} />)
    expect(screen.getByText(/DRAFT — not yet issued/)).toBeInTheDocument()
    rerender(<InvoiceDocument invoice={detail({ status: 'cancelled', payment_state: 'cancelled' })} />)
    expect(screen.getByText('CANCELLED')).toBeInTheDocument()
  })
})
