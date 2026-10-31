// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanProductsEditor } from '../components/PlanProductsEditor'
import { PolicyToggles } from '../components/PolicyToggles'
import { PlanDetailPage } from '../pages/PlanDetailPage'
import { PlanFormPage } from '../pages/PlanFormPage'
import type { PlanDetail, PlanPolicies, ProductRowDraft } from '../types'

afterEach(cleanup)

const plan: PlanDetail = {
  id: 5, name: 'Monthly Pro', price: '499.00', billing_frequency: 'monthly', min_quantity: 1,
  available_from: '2026-01-01', available_to: null, is_active: true, notes: null,
  policies: { auto_close_on_end: true, allow_early_close: false, allow_pause: true, allow_renewal: true },
  created_at: '', updated_at: '',
  products: [{
    id: 1, product_id: 9, product_name: 'CRM', product_is_active: true, variant_id: null,
    variant_label: null, variant_is_active: null, default_quantity: 2, unit_price_override: null,
  }],
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) })
    const body = handler(url, init)
    return { ok: true, status: 200, json: async () => ({ data: body }) }
  }))
  return calls
}

beforeEach(() => vi.unstubAllGlobals())

describe('PolicyToggles', () => {
  function Harness({ onChange }: { onChange: (p: PlanPolicies) => void }) {
    const [value, setValue] = useState<PlanPolicies>({
      auto_close_on_end: true, allow_early_close: false, allow_pause: false, allow_renewal: true,
    })
    return <PolicyToggles value={value} onChange={(p) => { setValue(p); onChange(p) }} />
  }

  it('emits the correct booleans for each toggle and shows help + notice', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByText(/do not change the state of existing subscriptions/i)).toBeTruthy()
    expect(screen.getByText('Customers may pause this subscription.')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Allow pause'))
    expect(onChange).toHaveBeenLastCalledWith({
      auto_close_on_end: true, allow_early_close: false, allow_pause: true, allow_renewal: true,
    })
    fireEvent.click(screen.getByLabelText('Allow renewal'))
    fireEvent.click(screen.getByLabelText('Allow early closure'))
    fireEvent.click(screen.getByLabelText('Close automatically at plan end'))
    expect(onChange).toHaveBeenLastCalledWith({
      auto_close_on_end: false, allow_early_close: true, allow_pause: true, allow_renewal: false,
    })
  })
})

describe('PlanProductsEditor', () => {
  function Harness({ initial = [] as ProductRowDraft[] }) {
    const [rows, setRows] = useState(initial)
    return <PlanProductsEditor rows={rows} onChange={setRows} />
  }

  it('shows the empty state, adds rows and removes them', () => {
    render(<Harness />)
    expect(screen.getByText('No products attached')).toBeTruthy()
    fireEvent.click(screen.getByText('Add product'))
    fireEvent.click(screen.getByText('Add product'))
    expect(screen.getAllByText('Remove')).toHaveLength(2)
    expect(screen.queryByText('No products attached')).toBeNull()
    fireEvent.click(screen.getByLabelText('Remove row 1'))
    expect(screen.getAllByText('Remove')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Remove row 1'))
    expect(screen.getByText('No products attached')).toBeTruthy()
  })
})

describe('PlanFormPage', () => {
  it('blocks submit with an inverted date range and sends nothing', async () => {
    const calls = mockFetch(() => plan)
    render(<PlanFormPage role="admin" onNavigate={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pro' } })
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText(/Available to/), { target: { value: '2026-02-01' } })
    fireEvent.click(screen.getByText('Save plan'))
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toMatch(/on or after the start date/)
    expect(calls).toHaveLength(0)
  })

  it('submits chosen frequency and policy booleans', async () => {
    const calls = mockFetch(() => plan)
    const navigate = vi.fn()
    render(<PlanFormPage role="admin" onNavigate={navigate} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Yearly Gold' } })
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '99.50' } })
    fireEvent.change(screen.getByLabelText('Billing frequency'), { target: { value: 'yearly' } })
    fireEvent.click(screen.getByLabelText('Allow pause'))
    fireEvent.click(screen.getByLabelText('Allow renewal'))
    fireEvent.click(screen.getByText('Save plan'))
    await waitFor(() => expect(calls).toHaveLength(1))
    const sent = JSON.parse(String(calls[0]?.init?.body))
    expect(calls[0]?.init?.method).toBe('POST')
    expect(sent).toMatchObject({
      name: 'Yearly Gold', price: '99.50', billing_frequency: 'yearly', available_to: null,
      auto_close_on_end: true, allow_early_close: false, allow_pause: true, allow_renewal: false,
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/plans/5'))
  })

  it('refuses staff', () => {
    render(<PlanFormPage role="staff" onNavigate={() => {}} />)
    expect(screen.getByRole('alert').textContent).toMatch(/Only administrators/)
  })
})

describe('PlanDetailPage', () => {
  it('is read-only for staff: no edit/delete/save/add controls, toggles disabled', async () => {
    mockFetch(() => plan)
    render(<PlanDetailPage role="staff" planId={5} onNavigate={() => {}} />)
    expect(await screen.findByText('Monthly Pro')).toBeTruthy()
    expect(screen.getByText(/read-only access/i)).toBeTruthy()
    for (const label of ['Edit', 'Delete', 'Save products', 'Add product']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    expect((screen.getByLabelText('Allow pause') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('CRM')).toBeTruthy()
  })

  it('lets admin edit products, warns about unsaved changes, and saves via PUT', async () => {
    const calls = mockFetch((_url, init) => (init?.method === 'PUT' ? plan.products : plan))
    render(<PlanDetailPage role="admin" planId={5} onNavigate={() => {}} />)
    await screen.findByText('Monthly Pro')
    expect((screen.getByText('Save products') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Default quantity for row 1'), { target: { value: '4' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)

    fireEvent.click(screen.getByText('Save products'))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true))
    const put = calls.find((c) => c.init?.method === 'PUT')!
    expect(JSON.parse(String(put.init?.body))).toEqual({
      products: [{ product_id: 9, variant_id: null, default_quantity: 4, unit_price_override: null }],
    })
  })

  it('asks before leaving with unsaved changes', async () => {
    mockFetch(() => plan)
    const navigate = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PlanDetailPage role="admin" planId={5} onNavigate={navigate} />)
    await screen.findByText('Monthly Pro')
    fireEvent.change(screen.getByLabelText('Default quantity for row 1'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Back to plans'))
    expect(confirm).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByText('Back to plans'))
    expect(navigate).toHaveBeenCalledWith('/plans')
  })
})
