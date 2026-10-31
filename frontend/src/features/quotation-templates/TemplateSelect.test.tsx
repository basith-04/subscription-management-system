import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemplateSelect } from './TemplateSelect'
import { listTemplates } from '../../api/quotation-templates'

vi.mock('../../api/quotation-templates', () => ({ listTemplates: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('TemplateSelect', () => {
  it('searches active templates and identifies results with additional pages', async () => {
    vi.mocked(listTemplates).mockResolvedValue({
      data: [{ id: 5, name: 'Yearly', plan_id: 1, plan_name: 'SaaS', validity_days: 30, payment_term_id: null, is_active: true, created_at: '', updated_at: '' }],
      meta: { page: 1, page_size: 100, total: 101, total_pages: 2 },
    })
    const onChange = vi.fn()
    render(<TemplateSelect value={null} onChange={onChange} />)
    expect(await screen.findByText('Yearly — SaaS')).toBeTruthy()
    expect(screen.getByText(/refine the search/i)).toBeTruthy()
    expect(listTemplates).toHaveBeenCalledWith({ q: '', is_active: true, page_size: 100 })
    fireEvent.change(screen.getByLabelText('Quotation template'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Yearly', plan_name: 'SaaS' }))
    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'Yearly' } })
    await waitFor(() => expect(listTemplates).toHaveBeenCalledWith({ q: 'Yearly', is_active: true, page_size: 100 }))
  })
})
