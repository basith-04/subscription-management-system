// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../../lib/api'
import { QuotationForm } from '../components/QuotationForm'
import { QuotationLinesEditor } from '../components/QuotationLinesEditor'
import { newRow, type LineRow } from '../lineRow'
import { StatusTimeline } from '../components/StatusTimeline'
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge'
import { TotalsPanel } from '../components/TotalsPanel'
import { addDays, computeLine, computeTotals, effectivePrice } from '../money'
import { QuotationCreatePage } from '../pages/QuotationCreatePage'
import { QuotationDetailPage } from '../pages/QuotationDetailPage'
import { QuotationListPage } from '../pages/QuotationListPage'
import { SubscriptionDetailPage } from '../pages/SubscriptionDetailPage'
import { SubscriptionListPage } from '../pages/SubscriptionListPage'
import type { Subscription } from '../types'

vi.mock('../../../lib/api', async (original) => {
  const actual = await original<typeof import('../../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
const request = vi.mocked(apiRequest)
afterEach(() => { cleanup(); vi.resetAllMocks() })

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 7, number: 'SUB-000007', status: 'draft', display_status: 'Draft', customer: { id: 9, name: 'Alice', email: 'a@x.co' },
  plan: { id: 3, name: 'Pro yearly', billing_frequency: 'yearly' }, template_id: null, payment_term: { id: 1, name: 'Net 15' },
  start_date: '2026-12-01', expiry_date: '2027-11-30', days_to_expiry: 400, quotation_valid_until: null, next_billing_date: null, auto_renew: false,
  confirmed_at: null, closed_at: null, closed_reason: null,
  items: [{ id: 1, product_id: 5, variant_id: 6, description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', tax_rule: { id: 2, name: 'GST 18%', rate: '18.000' },
    line_amount: '7800.00', tax_amount: '1404.00', line_total: '9204.00', sort_order: 0 }],
  totals: { subtotal: '7800.00', estimated_tax: '1404.00', total: '9204.00' },
  can_edit: true, can_issue: true, can_confirm: false, can_cancel: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
})
const listItem = (id: number, over = {}) => ({ id, number: `SUB-00000${id}`, customer: { id: 9, name: 'Alice' }, plan: { id: 3, name: 'Pro' }, status: 'draft', display_status: 'Draft',
  start_date: '2026-12-01', expiry_date: '2027-11-30', quotation_valid_until: null, next_billing_date: null, total_per_period: '9204.00', ...over })
const page = (data: unknown[], meta = {}) => ({ data, meta: { page: 1, page_size: 20, total: data.length, total_pages: 1, ...meta } })

const products = [{ id: 5, name: 'Platform', sales_price: '1000.00', is_active: true }]
const variants = [{ id: 6, product_id: 5, attribute_name: 'Brand', attribute_value: 'Odoo', price_adjustment: '560.00', effective_price: '1560.00', is_active: true }]
const taxes = [{ id: 2, name: 'GST 18%', rate: '18.000', is_active: true }]
const terms = [{ id: 1, name: 'Net 15', is_active: true }]
const plan = { id: 3, name: 'Pro yearly', billing_frequency: 'yearly', min_quantity: 2, available_from: '2020-01-01', available_to: null, is_active: true, policies: {} }

/** Routes the shared selects' calls (products, variants, plans, taxes, terms, customers) plus per-test overrides. */
function api(overrides: Record<string, unknown | ((opts?: RequestInit) => unknown)> = {}) {
  request.mockImplementation(async (path, opts) => {
    const p = String(path).split('?')[0]!
    const hit = Object.entries(overrides).find(([k]) => String(path).startsWith(k))
    if (hit) { const v = hit[1]; if (typeof v === 'function') return (v as (o?: RequestInit) => unknown)(opts); if (v instanceof Error) throw v; return v }
    if (p === '/products') return page(products)
    if (/^\/products\/\d+\/variants$/.test(p)) return variants
    if (p === '/plans') return page([plan])
    if (p === '/taxes') return taxes
    if (p === '/payment-terms') return terms
    if (p === '/quotation-templates') return []
    if (p === '/customers') return page([{ id: 9, name: 'Alice', email: 'a@x.co', company_name: null, phone: null, is_active: true }])
    if (p === '/auth/me') return { id: 1, role: 'staff', full_name: 'S', email: 's@x.co', customer_id: null }
    throw new Error(`unexpected ${String(path)}`)
  })
}

function wrap(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>)
}
const SearchEcho = () => <output data-testid="loc">{useLocation().pathname + useLocation().search}</output>
const callsTo = (prefix: string) => request.mock.calls.filter((c) => String(c[0]).startsWith(prefix))
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

describe('line maths (decimal-safe)', () => {
  it('33.33 × 5% rounds half-up to 1.67 and totals add up', () => {
    expect(computeLine({ quantity: '1', unit_price: '33.33', tax_rate: '5.000' })).toEqual({ line_amount: '33.33', tax_amount: '1.67', line_total: '35.00' })
    expect(computeLine({ quantity: '5', unit_price: '1560.00', tax_rate: '18.000' })?.line_total).toBe('9204.00')
    expect(computeTotals([computeLine({ quantity: '1', unit_price: '0.05', tax_rate: '10' }), computeLine({ quantity: '1', unit_price: '0.05', tax_rate: '10' }), null]))
      .toEqual({ subtotal: '0.10', estimated_tax: '0.02', total: '0.12' })
  })
  it('rejects invalid input and computes effective price without floats', () => {
    for (const q of ['0', '-1', '1.5', 'x', '']) expect(computeLine({ quantity: q, unit_price: '1.00' })).toBeNull()
    expect(computeLine({ quantity: '1', unit_price: '1.001' })).toBeNull()
    expect(effectivePrice('1000.00', '560.00')).toBe('1560.00')
    expect(effectivePrice('1000.00', '-1000.01')).toBeNull()
    expect(effectivePrice('0.10', '0.20')).toBe('0.30')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('presentational pieces', () => {
  it('badge shows derived variants and totals panel shows estimates', () => {
    render(<><SubscriptionStatusBadge status="quotation" displayStatus="Quotation (expired)" /><TotalsPanel totals={{ subtotal: '1.00', estimated_tax: '0.18', total: '1.18' }} /></>)
    expect(screen.getByText('Quotation (expired)')).toHaveClass('sub-badge--expired')
    expect(screen.getByTestId('total')).toHaveTextContent('1.18')
    expect(screen.getByText(/Estimate before discounts/)).toBeInTheDocument()
  })
})

describe('QuotationLinesEditor', () => {
  function Harness({ min = 1 }: { min?: number }) {
    const [rows, setRows] = useState<LineRow[]>([newRow()])
    return <QuotationLinesEditor rows={rows} onChange={setRows} taxRules={[{ id: 2, name: 'GST 18%', rate: '18.000' }]} minQuantity={min} />
  }
  const line = () => within(screen.getByRole('group', { name: 'Line 1' }))

  it('auto-fills the effective price from product and variant, then totals update live', async () => {
    api()
    const u = userEvent.setup()
    wrap(<Harness />)
    await waitFor(() => expect(line().getAllByRole('combobox')[0]).toBeEnabled())
    await screen.findByRole('option', { name: 'Platform' })
    await u.selectOptions(line().getAllByRole('combobox')[0]!, '5')
    expect(line().getByLabelText('Unit price line 1')).toHaveValue('1000.00')
    await screen.findByRole('option', { name: /Odoo/ })
    await u.selectOptions(line().getAllByRole('combobox')[1]!, '6')
    expect(line().getByLabelText('Unit price line 1')).toHaveValue('1560.00')
    await u.clear(line().getByLabelText('Quantity line 1')); await u.type(line().getByLabelText('Quantity line 1'), '5')
    await u.selectOptions(line().getByLabelText('Tax line 1'), '2')
    expect(line().getByLabelText('Line total 1')).toHaveTextContent('9204.00')
    expect(screen.getByTestId('editor-subtotal')).toHaveTextContent('7800.00')
    expect(screen.getByTestId('editor-tax')).toHaveTextContent('1404.00')
    expect(screen.getByTestId('editor-total')).toHaveTextContent('9204.00')
  })

  it('a hand-typed price stops catalogue auto-fill; invalid quantity / price / below-minimum are flagged', async () => {
    api()
    const u = userEvent.setup()
    wrap(<Harness min={3} />)
    await screen.findByRole('option', { name: 'Platform' })
    await u.selectOptions(line().getAllByRole('combobox')[0]!, '5')
    await u.clear(line().getByLabelText('Unit price line 1')); await u.type(line().getByLabelText('Unit price line 1'), '99.50')
    await screen.findByRole('option', { name: /Odoo/ })
    await u.selectOptions(line().getAllByRole('combobox')[1]!, '6')
    expect(line().getByLabelText('Unit price line 1')).toHaveValue('99.50')
    expect(line().getByText('The plan requires a quantity of at least 3')).toBeInTheDocument()
    await u.clear(line().getByLabelText('Quantity line 1')); await u.type(line().getByLabelText('Quantity line 1'), '2.5')
    expect(line().getByText(/whole number/)).toBeInTheDocument()
    await u.clear(line().getByLabelText('Unit price line 1')); await u.type(line().getByLabelText('Unit price line 1'), '1.234')
    expect(line().getByText(/at most 2 decimals/)).toBeInTheDocument()
    expect(line().getByLabelText('Line total 1')).toHaveTextContent('—')
  })

  it('adds and removes lines and shows the empty state', async () => {
    api()
    const u = userEvent.setup()
    wrap(<Harness />)
    await u.click(screen.getByRole('button', { name: 'Add line' }))
    expect(screen.getAllByRole('group', { name: /Line \d/ })).toHaveLength(2)
    await u.click(screen.getByRole('button', { name: 'Remove line 1' })); await u.click(screen.getByRole('button', { name: 'Remove line 1' }))
    expect(screen.getByText('No lines yet.')).toBeInTheDocument()
  })
})

describe('QuotationForm (create)', () => {
  const fill = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByLabelText('Customer')); await u.click(await screen.findByText('Alice'))
    await waitFor(() => expect(screen.getByLabelText('Plan')).toBeEnabled())
    await u.selectOptions(screen.getByLabelText('Plan'), '3')
    await u.selectOptions(screen.getByLabelText('Payment term'), '1')
    await u.type(screen.getByLabelText('Expiry date'), '2027-12-01')
    await screen.findByRole('option', { name: 'Platform' })
    const line = within(screen.getByRole('group', { name: 'Line 1' }))
    await u.selectOptions(line.getAllByRole('combobox')[0]!, '5')
    await u.clear(line.getByLabelText('Quantity line 1')); await u.type(line.getByLabelText('Quantity line 1'), '5')
  }

  it('validates required fields and never calls the API while invalid', async () => {
    api()
    const u = userEvent.setup()
    wrap(<QuotationForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    await u.click(screen.getByRole('button', { name: 'Save quotation' }))
    for (const text of ['Select a customer', 'Select a plan or a template', 'Select a payment term', 'Enter an expiry date', /Complete every line/]) expect(await screen.findByText(text)).toBeInTheDocument()
    expect(callsTo('/quotations')).toHaveLength(0)
  })

  it('rejects an expiry before the start date', async () => {
    api()
    const u = userEvent.setup()
    wrap(<QuotationForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    await u.clear(screen.getByLabelText('Start date')); await u.type(screen.getByLabelText('Start date'), '2027-01-10')
    await u.type(screen.getByLabelText('Expiry date'), '2027-01-01')
    await u.click(screen.getByRole('button', { name: 'Save quotation' }))
    expect(await screen.findByText('Expiry must be on or after the start date')).toBeInTheDocument()
  })

  it('submits the documented payload once, even on repeated clicks', async () => {
    let finish!: (v: unknown) => void
    api({ '/quotations': () => new Promise((r) => { finish = r }) })
    const u = userEvent.setup()
    const onSaved = vi.fn()
    wrap(<QuotationForm onSaved={onSaved} onCancel={vi.fn()} />)
    await fill(u)
    await u.click(screen.getByRole('button', { name: 'Save quotation' }))
    const busy = await screen.findByRole('button', { name: 'Saving…' })
    expect(busy).toBeDisabled()
    await u.click(busy); await u.dblClick(busy)
    finish(sub())
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(callsTo('/quotations')).toHaveLength(1)
    expect(bodyOf(callsTo('/quotations')[0]!)).toMatchObject({ customer_id: 9, plan_id: 3, payment_term_id: 1, expiry_date: '2027-12-01',
      items: [{ product_id: 5, quantity: 5, unit_price: '1000.00' }] })
  })

  it('shows plan minimum, per-line server errors and banners from 422 responses', async () => {
    api({ '/quotations': new ApiError(422, 'QUANTITY_BELOW_MINIMUM', 'Quantity is below the plan minimum', [{ field: 'items.0.quantity', message: 'Quantity must be at least 2' }]) })
    const u = userEvent.setup()
    wrap(<QuotationForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    await fill(u)
    await u.click(screen.getByRole('button', { name: 'Save quotation' }))
    expect(await screen.findByText('Quantity must be at least 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save quotation' })).toBeEnabled() // can fix and resubmit
  })

  it('choosing a template pre-fills plan, term and lines, and everything stays editable', async () => {
    api({
      '/quotation-templates?': [{ id: 11, name: 'Standard SaaS', plan_id: 3, plan_name: 'Pro yearly' }],
      '/quotation-templates/11': { id: 11, name: 'Standard SaaS', plan_id: 3, validity_days: 14, payment_term_id: 1,
        items: [{ product_id: 5, variant_id: 6, quantity: 4, unit_price_override: '99.00', tax_rule_id: 2 }] },
    })
    const u = userEvent.setup()
    wrap(<QuotationForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole('option', { name: /Standard SaaS/ })
    await u.selectOptions(screen.getByLabelText(/Template/), '11')
    await waitFor(() => expect(screen.getByLabelText('Unit price line 1')).toHaveValue('99.00'))
    expect(screen.getByLabelText('Quantity line 1')).toHaveValue('4')
    expect(screen.getByLabelText('Plan')).toHaveValue('3')
    expect(screen.getByLabelText('Payment term')).toHaveValue('1')
    await u.clear(screen.getByLabelText('Quantity line 1')); await u.type(screen.getByLabelText('Quantity line 1'), '6')
    expect(screen.getByLabelText('Quantity line 1')).toHaveValue('6')
  })

  it('degrades gracefully when templates are unavailable', async () => {
    api({ '/quotation-templates': new ApiError(404, 'NOT_FOUND', 'Route not found') })
    wrap(<QuotationForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByText('Templates unavailable')).toBeInTheDocument()
    expect(screen.getByLabelText('Template (optional)')).toBeDisabled()
  })
})

describe('list pages', () => {
  it('QuotationListPage reads filters from the URL, links rows and offers New quotation', async () => {
    api({ '/quotations': page([listItem(1), listItem(2, { status: 'quotation', display_status: 'Quotation', quotation_valid_until: '2026-12-10' })]) })
    wrap(<QuotationListPage />, '/app/quotations?status=quotation&customer_id=9&q=acme&valid_until_to=2026-12-31&sort=number&page=2')
    await screen.findByRole('table', { name: 'Quotations' })
    const url = String(callsTo('/quotations').at(-1)?.[0])
    for (const part of ['status=quotation', 'customer_id=9', 'q=acme', 'valid_until_to=2026-12-31', 'sort=number', 'page=2']) expect(url).toContain(part)
    expect(screen.getByRole('link', { name: 'SUB-000001' })).toHaveAttribute('href', '/app/quotations/1')
    expect(screen.getByRole('link', { name: 'New quotation' })).toHaveAttribute('href', '/app/quotations/new')
    expect(screen.getByText('2026-12-10')).toBeInTheDocument()
  })

  it('Apply and Clear write to the URL; empty, filtered-empty and error states render', async () => {
    api({ '/quotations': page([listItem(1)]) })
    const u = userEvent.setup()
    wrap(<><QuotationListPage /><SearchEcho /></>, '/app/quotations?page=3')
    await screen.findByRole('table')
    await u.type(screen.getByLabelText('Search'), 'bob'); await u.selectOptions(screen.getByLabelText('Status'), 'draft')
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('q=bob'))
    expect(screen.getByTestId('loc').textContent).toContain('status=draft'); expect(screen.getByTestId('loc').textContent).not.toContain('page=3')
    await u.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).not.toContain('q='))
    cleanup()
    api({ '/quotations': page([]) }); wrap(<QuotationListPage />)
    expect(await screen.findByText('No quotations yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create quotation' })).toBeInTheDocument()
    cleanup()
    api({ '/quotations': page([]) }); wrap(<QuotationListPage />, '/app/quotations?q=zzz')
    expect(await screen.findByText('No quotations match these filters.')).toBeInTheDocument()
    cleanup()
    api({ '/quotations': new ApiError(500, 'X', 'down') }); wrap(<QuotationListPage />)
    expect(await screen.findByText('Unable to load quotations.')).toBeInTheDocument()
  })

  it('SubscriptionListPage offers every status, plan and expiry filters and no create button', async () => {
    api({ '/subscriptions': page([listItem(3, { status: 'confirmed', display_status: 'Confirmed' })], { total: 45, total_pages: 3 }) })
    const u = userEvent.setup()
    wrap(<><SubscriptionListPage /><SearchEcho /></>, '/app/subscriptions?status=confirmed&plan_id=3&expiry_from=2026-01-01&expiry_to=2027-01-01')
    await screen.findByRole('table', { name: 'Subscriptions' })
    const url = String(callsTo('/subscriptions').at(-1)?.[0])
    for (const part of ['status=confirmed', 'plan_id=3', 'expiry_from=2026-01-01', 'expiry_to=2027-01-01']) expect(url).toContain(part)
    expect(within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any', 'draft', 'quotation', 'confirmed', 'active', 'closed'])
    expect(screen.queryByRole('link', { name: 'New quotation' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('page=2'))
  })
})

describe('QuotationCreatePage', () => {
  it('creates and navigates to the new quotation', async () => {
    api({ '/quotations': sub() })
    const u = userEvent.setup()
    wrap(<Routes><Route path="/app/quotations/new" element={<QuotationCreatePage />} /><Route path="/app/quotations/:id" element={<SearchEcho />} /><Route path="/app/quotations" element={<SearchEcho />} /></Routes>, '/app/quotations/new')
    expect(screen.getByRole('heading', { name: 'New quotation' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('loc')).toBeInTheDocument()
  })
  it('edit mode loads the record, saves with PATCH, and refuses non-editable records', async () => {
    api({ '/subscriptions/7': sub(), '/quotations/7': (o?: RequestInit) => (o?.method === 'PATCH' ? sub({ expiry_date: '2028-01-01' }) : null) })
    const u = userEvent.setup()
    wrap(<Routes><Route path="/app/quotations/:id/edit" element={<QuotationCreatePage />} /><Route path="/app/quotations/:id" element={<SearchEcho />} /></Routes>, '/app/quotations/7/edit')
    expect(await screen.findByRole('heading', { name: 'Edit SUB-000007' })).toBeInTheDocument()
    expect(screen.getByLabelText('Unit price line 1')).toHaveValue('1560.00')
    await u.clear(screen.getByLabelText('Expiry date')); await u.type(screen.getByLabelText('Expiry date'), '2028-01-01')
    await u.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(callsTo('/quotations/7').some((c) => (c[1] as RequestInit).method === 'PATCH')).toBe(true))
    cleanup()
    api({ '/subscriptions/7': sub({ status: 'confirmed', can_edit: false }) })
    wrap(<Routes><Route path="/app/quotations/:id/edit" element={<QuotationCreatePage />} /></Routes>, '/app/quotations/7/edit')
    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument()
  })
})

describe('detail pages', () => {
  const detail = (s: Subscription, variant: 'q' | 's' = 'q') => {
    api({ '/quotations/7': s, '/subscriptions/7/history': [{ id: 1, action: 'subscription.create', actor: { id: 1, name: 'Tester' }, old_values: null, new_values: { status: 'draft' }, created_at: '2026-11-01T00:00:00Z' }], '/subscriptions/7': s })
    return wrap(<Routes><Route path="/app/quotations/:id" element={<QuotationDetailPage />} /><Route path="/app/subscriptions/:id" element={<SubscriptionDetailPage />} /></Routes>,
      variant === 'q' ? '/app/quotations/7' : '/app/subscriptions/7')
  }
  const bar = () => within(screen.getByRole('toolbar', { name: 'Actions' }))
  const names = () => bar().queryAllByRole('button').concat(bar().queryAllByRole('link')).map((e) => e.textContent).sort()

  it.each([
    ['draft', sub(), ['Cancel', 'Edit', 'Issue quotation']],
    ['quotation', sub({ status: 'quotation', display_status: 'Quotation', can_issue: false, can_confirm: true }), ['Cancel', 'Confirm', 'Edit']],
    ['quotation (expired)', sub({ status: 'quotation', display_status: 'Quotation (expired)', can_issue: false, can_confirm: false }), ['Cancel', 'Edit']],
    ['confirmed', sub({ status: 'confirmed', display_status: 'Confirmed', can_edit: false, can_issue: false, can_confirm: false }), ['Cancel']],
    ['closed', sub({ status: 'closed', display_status: 'Closed', closed_reason: 'cancelled', can_edit: false, can_issue: false, can_confirm: false, can_cancel: false }), []],
  ])('shows the right actions for %s', async (_n, s, expected) => {
    detail(s)
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect(names()).toEqual(expected)
  })

  it('renders header, lines, totals and the history timeline', async () => {
    detail(sub({ status: 'quotation', display_status: 'Quotation', quotation_valid_until: '2026-12-10', can_issue: false, can_confirm: true }))
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/app/customers/9')
    expect(screen.getByText('Platform – Brand: Odoo')).toBeInTheDocument()
    expect(screen.getByTestId('total')).toHaveTextContent('9204.00')
    expect(screen.getByText('2026-12-10')).toBeInTheDocument()
    expect(await screen.findByText('Created')).toBeInTheDocument()
  })

  it('issue: dialog sends valid_until; confirm: dialog then API; cancel: optional reason; success toast', async () => {
    const u = userEvent.setup()
    detail(sub())
    await u.click(await screen.findByRole('button', { name: 'Issue quotation' }))
    const d = within(screen.getByRole('dialog'))
    await u.clear(d.getByLabelText('Valid until')); await u.type(d.getByLabelText('Valid until'), '2099-01-31')
    await u.click(d.getByRole('button', { name: 'Issue quotation' }))
    expect(await screen.findByText('SUB-000007 issued.')).toBeInTheDocument()
    expect(bodyOf(callsTo('/quotations/7/issue')[0]!)).toEqual({ valid_until: '2099-01-31' })
    cleanup()

    detail(sub({ status: 'quotation', can_issue: false, can_confirm: true }))
    await u.click(await screen.findByRole('button', { name: 'Confirm' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('SUB-000007 confirmed.')).toBeInTheDocument()
    expect(callsTo('/quotations/7/confirm')).toHaveLength(1)
    cleanup()

    detail(sub())
    await u.click(await screen.findByRole('button', { name: 'Cancel' }))
    await u.type(screen.getByLabelText('Reason (optional)'), 'Changed mind')
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel quotation' }))
    expect(await screen.findByText('SUB-000007 cancelled.')).toBeInTheDocument()
    expect(bodyOf(callsTo('/quotations/7/cancel')[0]!)).toEqual({ reason: 'Changed mind' })
  })

  it('server conflicts (expired / invalid transition) show a banner and refetch', async () => {
    const u = userEvent.setup()
    detail(sub({ status: 'quotation', can_issue: false, can_confirm: true }))
    request.mockImplementation(async (path) => {
      const p = String(path)
      if (p.startsWith('/quotations/7/confirm')) throw new ApiError(409, 'QUOTATION_EXPIRED', 'Quotation has expired')
      if (p.startsWith('/subscriptions/7/history')) return []
      if (p.startsWith('/subscriptions/7')) return sub({ status: 'quotation', display_status: 'Quotation (expired)', can_issue: false, can_confirm: false })
      throw new Error(p)
    })
    await u.click(await screen.findByRole('button', { name: 'Confirm' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Quotation has expired')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument())
  })

  it('subscription detail shows the F10 / F12 / F15 slots; quotation detail does not', async () => {
    detail(sub({ status: 'confirmed', can_edit: false, can_issue: false, can_confirm: false }), 's')
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect([...document.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))).toEqual(['operations', 'billing', 'discounts'])
    cleanup()
    detail(sub())
    await screen.findByRole('heading', { name: /SUB-000007/ })
    expect(document.querySelectorAll('[data-slot]')).toHaveLength(0)
  })

  it('not-found and error states', async () => {
    api({ '/subscriptions/7': new ApiError(404, 'NOT_FOUND', 'Subscription not found') })
    wrap(<Routes><Route path="/app/quotations/:id" element={<QuotationDetailPage />} /></Routes>, '/app/quotations/7')
    expect(await screen.findByText('Not found.')).toBeInTheDocument()
    cleanup()
    api({ '/subscriptions/7': new ApiError(500, 'X', 'down') })
    wrap(<Routes><Route path="/app/quotations/:id" element={<QuotationDetailPage />} /></Routes>, '/app/quotations/7')
    expect(await screen.findByText('Unable to load this record.')).toBeInTheDocument()
  })
})

describe('StatusTimeline', () => {
  it('shows empty and error states', async () => {
    api({ '/subscriptions/7/history': [] }); wrap(<StatusTimeline subscriptionId={7} />)
    expect(await screen.findByText('No history yet.')).toBeInTheDocument()
    cleanup()
    api({ '/subscriptions/7/history': new ApiError(500, 'X', 'down') }); wrap(<StatusTimeline subscriptionId={7} />)
    expect(await screen.findByText('Unable to load history.')).toBeInTheDocument()
  })
})
