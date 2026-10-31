import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaymentTermSelect } from './PaymentTermSelect.js'
import * as termApi from '../../lib/api/payment-terms.js'

describe('PaymentTermSelect Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('queries active payment terms and renders options formatted with due days', async () => {
    const mockTerms: termApi.PaymentTerm[] = [
      {
        id: 'term_1',
        name: 'Due on receipt',
        due_days: 0,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'term_2',
        name: 'Net 30',
        due_days: 30,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ]

    const getTermsSpy = vi
      .spyOn(termApi, 'getPaymentTerms')
      .mockResolvedValue(mockTerms)

    const handleChange = vi.fn()
    render(<PaymentTermSelect onChange={handleChange} />)

    expect(getTermsSpy).toHaveBeenCalledWith({ is_active: true }, undefined)

    await waitFor(() => {
      expect(screen.getByText('Due on receipt (Due on receipt)')).toBeDefined()
      expect(screen.getByText('Net 30 (30 days)')).toBeDefined()
    })

    const select = screen.getByLabelText(/Select payment term/i)
    fireEvent.change(select, { target: { value: 'term_2' } })

    expect(handleChange).toHaveBeenCalledWith('term_2')
  })
})
