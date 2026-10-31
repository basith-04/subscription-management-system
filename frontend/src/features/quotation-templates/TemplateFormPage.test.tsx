import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTemplate, getTemplate, updateTemplate } from '../../api/quotation-templates'
import { useAuth } from '../auth/useAuth'
import { TemplateFormPage } from './TemplateFormPage'

vi.mock('../../api/quotation-templates', () => ({ createTemplate: vi.fn(), getTemplate: vi.fn(), updateTemplate: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../plans', () => ({ PlanSelect: ({ onChange }: { onChange: (id: number, plan: { min_quantity: number }) => void }) => <button type="button" onClick={() => onChange(1, { min_quantity: 2 })}>Pick plan</button> }))
vi.mock('../payment-terms', () => ({ PaymentTermSelect: ({ onChange }: { onChange: (id: string) => void }) => <button type="button" onClick={() => onChange('2')}>Pick term</button> }))
vi.mock('../../components/LineItemsEditor', () => ({ LineItemsEditor: ({ onChange }: { onChange: (rows: unknown[]) => void }) => <button type="button" onClick={() => onChange([{ key: 'a', product_id: 5, variant_id: null, quantity: '2', unit_price: '10.00', base_price: '10.00', overridden: false, tax_rule_id: null }])}>Add test line</button> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function page(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/quotation-templates/new" element={<TemplateFormPage />} /><Route path="/app/quotation-templates/:id" element={<TemplateFormPage />} /><Route path="/app/quotation-templates" element={<p>Saved</p>} /></Routes></MemoryRouter>)
}
describe('template form', () => {
  it('submits the real create payload without converting money to floats', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, role: 'admin', full_name: 'Admin', email: 'a@example.test', customer_id: null }, loading: false, error: null })
    vi.mocked(createTemplate).mockResolvedValue({} as Awaited<ReturnType<typeof createTemplate>>)
    page('/app/quotation-templates/new')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard SaaS yearly' } })
    fireEvent.click(screen.getByText('Pick plan'))
    fireEvent.click(screen.getByText('Pick term'))
    fireEvent.click(screen.getByText('Add test line'))
    fireEvent.click(screen.getByText('Save template'))
    await waitFor(() => expect(createTemplate).toHaveBeenCalledWith({ name: 'Standard SaaS yearly', plan_id: 1, validity_days: 30, payment_term_id: 2, notes: null, items: [{ product_id: 5, variant_id: null, quantity: 2, unit_price_override: null, tax_rule_id: null }] }))
    expect(await screen.findByText('Saved')).toBeTruthy()
  })
  it('shows a loaded template read-only for Staff', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 2, role: 'staff', full_name: 'Staff', email: 's@example.test', customer_id: null }, loading: false, error: null })
    vi.mocked(getTemplate).mockResolvedValue({ id: 4, name: 'Read only', plan_id: 1, plan_name: 'SaaS', plan_is_active: true, plan_min_quantity: 1, validity_days: 30, payment_term_id: null, payment_term_name: null, payment_term_is_active: null, notes: null, is_active: true, created_at: '', updated_at: '', items: [] })
    page('/app/quotation-templates/4')
    expect((await screen.findByDisplayValue('Read only')).matches(':disabled')).toBe(true)
    expect(screen.queryByText('Save template')).toBeNull()
    expect(updateTemplate).not.toHaveBeenCalled()
  })
})
