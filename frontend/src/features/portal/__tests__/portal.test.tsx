// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../../lib/api'
import { PortalLayout } from '../../../layouts/PortalLayout'
import { RequireAuth } from '../../auth/guards'
import { ChangePasswordPage, MyInvoiceDetailPage, MyInvoicesPage, MySubscriptionDetailPage, MySubscriptionsPage, PortalHomePage } from '..'
import { PortalNotFound } from '../components/PortalNotFound'
import type { MyInvoiceDetail, MyInvoiceListItem, MySubscription, MySubscriptionDetail } from '../types'

vi.mock('../../../lib/api', async (original) => {
  const actual = await original<typeof import('../../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
const request = vi.mocked(apiRequest)
afterEach(() => { cleanup(); vi.resetAllMocks() })

const flags = { can_confirm: false, can_pause: false, can_resume: false, can_renew: false, can_close: false }
const sub = (id: number, over: Partial<MySubscription> = {}): MySubscription => ({
  id, number: `SUB-00000${id}`, status: 'active', display_status: 'Active', plan: { id: 3, name: 'Pro yearly', billing_frequency: 'yearly' },
  start_date: '2026-01-01', expiry_date: '2026-12-31', days_to_expiry: 50, quotation_valid_until: null, next_billing_date: '2026-12-01', ...flags, ...over,
})
const subDetail = (over: Partial<MySubscriptionDetail> = {}): MySubscriptionDetail => ({
  ...sub(7), payment_term: 'Net 15', paused: false, auto_renew: false,
  items: [{ description: 'Platform – Brand: Odoo', quantity: 2, unit_price: '100.00', tax: { name: 'GST 18%', rate: '18.000' }, line_amount: '200.00', tax_amount: '36.00', line_total: '236.00' }],
  totals: { subtotal: '200.00', estimated_tax: '36.00', total: '236.00' }, ...over,
})
const inv = (id: number, over: Partial<MyInvoiceListItem> = {}): MyInvoiceListItem => ({
  id, number: `INV-00000${id}`, status: 'confirmed', payment_state: 'outstanding', issue_date: '2026-11-01', due_date: '2026-11-16', total: '100.00', amount_paid: '0.00', amount_due: '100.00', ...over,
})
const invDetail = (over: Partial<MyInvoiceDetail> = {}): MyInvoiceDetail => ({
  id: 5, number: 'INV-000005', status: 'confirmed', payment_state: 'partially_paid', subscription: { id: 7, number: 'SUB-000007' },
  customer: { id: 9, name: 'Snapshot Name Ltd', email: 'a@x.co', tax_id: null, billing_address: { line1: '1 Old Street' } },
  period_start: '2026-11-01', period_end: '2026-11-30', issue_date: '2026-11-01', due_date: '2026-11-16', payment_term: 'Net 15', notes: null,
  items: [{ id: 1, description: 'Platform', quantity: 2, unit_price: '50.00', line_subtotal: '100.00', discount_amount: '0.00', taxable_amount: '100.00', tax_name: null, tax_rate: '0.000', tax_amount: '0.00', line_total: '100.00' }],
  tax_details: [], subtotal: '100.00', discount_total: '0.00', tax_total: '0.00', total: '100.00', amount_paid: '30.00', amount_due: '70.00',
  payments: [{ id: 1, method: 'upi', payment_date: '2026-11-02', amount: '30.00', reference_number: 'R-1', is_voided: false }, { id: 2, method: 'cash', payment_date: '2026-11-03', amount: '10.00', reference_number: null, is_voided: true }], ...over,
})
const page = (data: unknown[], meta: object = {}) => ({ data, meta: { page: 1, page_size: 20, total: data.length, total_pages: 1, summary: { outstanding_amount: '110.00', overdue_amount: '40.00' }, ...meta } })

type Handler = unknown | ((opts?: RequestInit) => unknown)
function api(map: Record<string, Handler>) {
  request.mockImplementation(async (path, opts) => {
    const key = Object.keys(map).sort((x, y) => y.length - x.length).find((k) => String(path).startsWith(k))
    if (!key) throw new Error(`unexpected ${String(path)}`)
    const v = map[key]
    const out = typeof v === 'function' ? (v as (o?: RequestInit) => unknown)(opts) : v
    if (out instanceof Error) throw out
    return out
  })
}
function wrap(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>) }
}
const Echo = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output> }
const calls = (prefix: string) => request.mock.calls.filter((c) => String(c[0]).startsWith(prefix))

describe('PortalHomePage', () => {
  it('shows backend totals, active subscriptions, quotations awaiting confirmation and recent invoices', async () => {
    api({
      '/me/subscriptions?status=active': page([sub(1)]), '/me/subscriptions?status=quotation': page([sub(2, { status: 'quotation', display_status: 'Quotation', can_confirm: true })]),
      '/me/invoices': page([inv(5, { payment_state: 'overdue' })]),
    })
    wrap(<PortalHomePage />)
    expect(await screen.findByTestId('outstanding')).toHaveTextContent('110.00')
    expect(screen.getByTestId('overdue')).toHaveTextContent('40.00')
    expect(await screen.findByRole('link', { name: 'SUB-000001' })).toHaveAttribute('href', '/portal/subscriptions/1')
    expect(screen.getByText('Quotations awaiting your confirmation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review and confirm' })).toHaveAttribute('href', '/portal/subscriptions/2')
    expect(screen.getByRole('link', { name: 'INV-000005' })).toHaveAttribute('href', '/portal/invoices/5')
  })
  it('shows friendly empty states and never invents numbers', async () => {
    api({ '/me/subscriptions': page([]), '/me/invoices': page([], { summary: { outstanding_amount: '0.00', overdue_amount: '0.00' } }) })
    wrap(<PortalHomePage />)
    expect(await screen.findByText('You have no active subscriptions yet.')).toBeInTheDocument()
    expect(screen.getByText('You have no invoices yet.')).toBeInTheDocument()
    expect(screen.queryByText('Quotations awaiting your confirmation')).not.toBeInTheDocument()
  })
  it('shows a retryable error', async () => {
    const u = userEvent.setup()
    api({ '/me/subscriptions': page([]), '/me/invoices': new ApiError(500, 'INTERNAL_ERROR', 'down') })
    wrap(<PortalHomePage />)
    const retry = (await screen.findAllByRole('button', { name: 'Try again' }))[0]!
    api({ '/me/subscriptions': page([]), '/me/invoices': page([inv(5)]) })
    await u.click(retry)
    expect(await screen.findByRole('link', { name: 'INV-000005' })).toBeInTheDocument()
  })
})

describe('MySubscriptionsPage', () => {
  it('reads filter and page from the URL, renders cards and pagination', async () => {
    const u = userEvent.setup()
    api({ '/me/subscriptions': page([sub(1), sub(2)], { total: 45, total_pages: 3, page: 2 }) })
    wrap(<><MySubscriptionsPage /><Echo /></>, '/portal/subscriptions?status=active&page=2')
    await screen.findByRole('link', { name: 'SUB-000001' })
    expect(String(calls('/me/subscriptions').at(-1)?.[0])).toContain('status=active')
    expect(String(calls('/me/subscriptions').at(-1)?.[0])).toContain('page=2')
    await u.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=3'))
    await u.selectOptions(screen.getByLabelText('Status'), 'closed')
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('status=closed'))
    expect(screen.getByTestId('loc').textContent).not.toContain('page=')
  })
  it('empty state and filtered-empty state', async () => {
    api({ '/me/subscriptions': page([]) })
    wrap(<MySubscriptionsPage />)
    expect(await screen.findByText('You have no subscriptions yet.')).toBeInTheDocument()
    cleanup()
    wrap(<MySubscriptionsPage />, '/portal/subscriptions?status=closed')
    expect(await screen.findByText('No subscriptions match this filter.')).toBeInTheDocument()
  })
})

describe('MySubscriptionDetailPage + CustomerActionPanel', () => {
  const open = (detail: unknown, extra: Record<string, Handler> = {}) => {
    api({ '/me/subscriptions/7': detail as Handler, ...extra })
    return wrap(<Routes><Route path="/portal/subscriptions/:id" element={<MySubscriptionDetailPage />} /></Routes>, '/portal/subscriptions/7')
  }
  const buttons = () => within(screen.getByRole('region', { name: 'Actions' })).queryAllByRole('button').map((b) => b.textContent)

  it.each([
    ['quotation: confirm only', { status: 'quotation', display_status: 'Quotation', can_confirm: true }, ['Confirm quotation']],
    ['active with all policies', { can_pause: true, can_renew: true, can_close: true }, ['Pause', 'Renew', 'Close subscription']],
    ['paused: resume only', { display_status: 'Active (Paused)', paused: true, can_resume: true }, ['Resume']],
    ['plan forbids everything', {}, []],
    ['closed', { status: 'closed', display_status: 'Closed' }, []],
  ])('renders exactly the actions the server allows: %s', async (_n, over, expected) => {
    open(subDetail(over as Partial<MySubscriptionDetail>))
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect(buttons()).toEqual(expected)
    if (expected.length === 0) expect(screen.getByText(/No actions are available/)).toBeInTheDocument()
  })

  it('shows plan information, lines and backend totals without any internal data', async () => {
    open(subDetail())
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect(screen.getByText(/Pro yearly \(yearly\)/)).toBeInTheDocument()
    expect(screen.getByText('Platform – Brand: Odoo')).toBeInTheDocument()
    expect(screen.getByTestId('total')).toHaveTextContent('236.00')
    expect(screen.getByText(/Estimates before any discounts/)).toBeInTheDocument()
  })

  it('confirm asks first, calls the F09 endpoint with no customer id, and refreshes every portal query', async () => {
    const u = userEvent.setup()
    const { client } = open(subDetail({ status: 'quotation', can_confirm: true }), { '/quotations/7/confirm': { id: 7, status: 'confirmed' } })
    const spy = vi.spyOn(client, 'invalidateQueries')
    await u.click(await screen.findByRole('button', { name: 'Confirm quotation' }))
    expect(calls('/quotations')).toHaveLength(0) // nothing sent before the dialog is confirmed
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm quotation' }))
    expect(await screen.findByText('Confirm quotation completed.')).toBeInTheDocument()
    expect(calls('/quotations')).toHaveLength(1)
    expect(calls('/quotations')[0]![1]).toEqual({ method: 'POST' })
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey)).toContainEqual(['me'])
  })

  it('pause / renew / close call the F10 endpoints; destructive close needs confirmation', async () => {
    const u = userEvent.setup()
    open(subDetail({ can_pause: true, can_renew: true, can_close: true }), { '/subscriptions/7/': { ok: true } })
    await u.click(await screen.findByRole('button', { name: 'Pause' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause' }))
    await screen.findByText('Pause completed.')
    await u.click(screen.getByRole('button', { name: 'Close subscription' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(calls('/subscriptions/7/').map((c) => c[0])).toEqual(['/subscriptions/7/pause'])
  })

  it('a plan refusal, a stale state and an expired session each show a clear message', async () => {
    const u = userEvent.setup()
    open(subDetail({ can_pause: true }), { '/subscriptions/7/pause': new ApiError(403, 'PLAN_POLICY_FORBIDS', 'This plan does not allow pausing') })
    await u.click(await screen.findByRole('button', { name: 'Pause' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your plan doesn’t allow this: This plan does not allow pausing')
    cleanup()
    open(subDetail({ can_pause: true }), { '/subscriptions/7/pause': new ApiError(409, 'INVALID_STATE_TRANSITION', 'Subscription state does not permit this action') })
    await u.click(await screen.findByRole('button', { name: 'Pause' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Subscription state does not permit this action')
  })

  it('a 404 renders a neutral not-found page that never hints at existence; an unexpected error offers retry', async () => {
    open(new ApiError(404, 'NOT_FOUND', 'Subscription not found'))
    expect(await screen.findByRole('alert', { name: 'Not found' })).toHaveTextContent('We couldn’t find that subscription.')
    expect(document.body.textContent).not.toMatch(/another customer|belongs to|permission|forbidden/i)
    cleanup()
    open(new ApiError(500, 'INTERNAL_ERROR', 'down'))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('rejects a malformed id without calling the API', async () => {
    api({})
    wrap(<Routes><Route path="/portal/subscriptions/:id" element={<MySubscriptionDetailPage />} /></Routes>, '/portal/subscriptions/abc')
    expect(await screen.findByRole('alert', { name: 'Not found' })).toBeInTheDocument()
    expect(calls('/me/subscriptions/0')).toHaveLength(1) // guard query for id 0 is the neutral not-found path
  })
})

describe('MyInvoicesPage', () => {
  it('lists with payment-state badges, backend summary and URL-bound filters', async () => {
    const u = userEvent.setup()
    api({ '/me/invoices': page([inv(5, { payment_state: 'overdue' }), inv(6, { status: 'cancelled', payment_state: 'cancelled' })]) })
    wrap(<><MyInvoicesPage /><Echo /></>, '/portal/invoices?payment_state=overdue&status=confirmed')
    await screen.findByRole('table', { name: 'Invoices' })
    const url = String(calls('/me/invoices').at(-1)?.[0])
    expect(url).toContain('payment_state=overdue'); expect(url).toContain('status=confirmed')
    expect(screen.getByTestId('overdue')).toHaveTextContent('40.00')
    expect(screen.getByText('Overdue', { selector: '.payment-badge' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'INV-000005' })).toHaveAttribute('href', '/portal/invoices/5')
    expect(within(screen.getByLabelText('Invoice status')).queryByRole('option', { name: 'draft' })).not.toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Payment status'), 'paid')
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('payment_state=paid'))
  })
  it('empty and error states', async () => {
    api({ '/me/invoices': page([]) }); wrap(<MyInvoicesPage />)
    expect(await screen.findByText('You have no invoices yet.')).toBeInTheDocument()
    cleanup()
    api({ '/me/invoices': new ApiError(500, 'X', 'down') }); wrap(<MyInvoicesPage />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('MyInvoiceDetailPage', () => {
  const open = (detail: unknown) => {
    api({ '/me/invoices/5': detail as Handler })
    return wrap(<Routes><Route path="/portal/invoices/:id" element={<MyInvoiceDetailPage />} /></Routes>, '/portal/invoices/5')
  }
  it('renders F11’s InvoiceDocument from the stored snapshot, with payment history and voided payments marked', async () => {
    open(invDetail())
    const doc = await screen.findByLabelText('Invoice INV-000005')
    expect(doc).toHaveTextContent('Snapshot Name Ltd'); expect(doc).toHaveTextContent('1 Old Street'); expect(doc).toHaveTextContent('70.00')
    const payments = screen.getByRole('region', { name: 'Payments' })
    expect(payments).toHaveTextContent('UPI'); expect(payments).toHaveTextContent('R-1'); expect(payments).toHaveTextContent('Voided')
    expect(within(payments).getAllByRole('listitem')[1]).toHaveClass('is-voided')
  })
  it('Print opens the browser print dialog; the toolbar is marked no-print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const u = userEvent.setup()
    open(invDetail({ payments: [] }))
    await u.click(await screen.findByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Print' }).parentElement).toHaveClass('no-print')
    expect(screen.getByText('No payments recorded yet.')).toBeInTheDocument()
    print.mockRestore()
  })
  it('404 is a neutral not-found page', async () => {
    open(new ApiError(404, 'NOT_FOUND', 'Invoice not found'))
    expect(await screen.findByRole('alert', { name: 'Not found' })).toHaveTextContent('We couldn’t find that invoice.')
  })
})

describe('PortalLayout and navigation', () => {
  it('links to home, subscriptions, invoices, profile (F04) and change password (F02) and signs out', async () => {
    const u = userEvent.setup()
    api({ '/auth/me': { id: 1, role: 'customer', full_name: 'Alice A', email: 'a@x.co', customer_id: 9 }, '/auth/logout': {}, '/me/': page([]) })
    wrap(<Routes><Route path="/portal" element={<PortalLayout />}><Route index element={<Echo />} /></Route><Route path="/login" element={<p>login page</p>} /></Routes>, '/portal')
    const nav = await screen.findByRole('navigation', { name: 'Portal' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', '/portal'], ['Subscriptions', '/portal/subscriptions'], ['Invoices', '/portal/invoices'], ['Profile', '/portal/profile'], ['Change password', '/portal/change-password'],
    ])
    expect(await screen.findByText('Alice A')).toBeInTheDocument()
    await u.click(within(nav).getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })
  it('unknown portal URLs and the pending change-password page are neutral', () => {
    render(<MemoryRouter><PortalNotFound /></MemoryRouter>)
    expect(screen.getByRole('alert', { name: 'Not found' })).toBeInTheDocument()
    cleanup()
    render(<ChangePasswordPage />)
    expect(screen.getByText(/isn’t available yet/)).toBeInTheDocument()
  })
})

describe('session expiry', () => {
  it('an unauthenticated deep link redirects to login and remembers where the customer was going', async () => {
    api({ '/auth/me': new ApiError(401, 'UNAUTHENTICATED', 'Authentication required') })
    const Login = () => <output data-testid="from">{String((useLocation().state as { from?: string } | null)?.from)}</output>
    wrap(<Routes><Route element={<RequireAuth />}><Route path="/portal/invoices/:id" element={<p>secret</p>} /></Route><Route path="/login" element={<Login />} /></Routes>, '/portal/invoices/5')
    expect(await screen.findByTestId('from')).toHaveTextContent('/portal/invoices/5')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })
})

describe('mobile-first styles (360px)', () => {
  // Read the stylesheet source directly (vitest does not expose CSS text); path is relative to the frontend package root.
  let css = ''
  beforeAll(async () => {
    const fs = (await import('node:fs' as string)) as { readFileSync(path: string, enc: string): string }
    css = fs.readFileSync('src/features/portal/portal.css', 'utf8')
  })
  it('base rules are single-column and touch friendly; wider layouts are opt-in via min-width', () => {
    expect(css).toMatch(/\.portal-grid \{ display: grid; grid-template-columns: 1fr;/)
    expect(css).toMatch(/@media \(min-width: 720px\)/)
    expect(css).not.toMatch(/max-width: 3[0-9]{2}px/)
    expect(css).toMatch(/\.portal-button \{[^}]*min-height: 44px/)
    expect(css).toMatch(/\.portal-nav a, \.portal-nav button \{[^}]*min-height: 44px/)
    expect(css).toMatch(/overflow-wrap: anywhere/)
    expect(css).toMatch(/\.portal-table td::before \{ content: attr\(data-label\)/) // invoice rows become labelled cards on phones
  })
  it('print hides the portal chrome', () => {
    expect(css).toMatch(/@media print[\s\S]*\.no-print \{ display: none !important/)
  })
})
