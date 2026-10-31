import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaxSelect } from './TaxSelect.js'
import * as taxApi from '../../lib/api/taxes.js'

describe('TaxSelect Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('queries active taxes and renders options formatted with rate', async () => {
    const mockTaxes: taxApi.TaxRule[] = [
      {
        id: 'tax_1',
        name: 'GST 5%',
        rate: '5.000',
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'tax_2',
        name: 'GST 18%',
        rate: '18.000',
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ]

    const getTaxesSpy = vi
      .spyOn(taxApi, 'getTaxes')
      .mockResolvedValue(mockTaxes)

    const handleChange = vi.fn()
    render(<TaxSelect onChange={handleChange} />)

    expect(getTaxesSpy).toHaveBeenCalledWith({ is_active: true }, undefined)

    await waitFor(() => {
      expect(screen.getByText('GST 5% (5.000 %)')).toBeDefined()
      expect(screen.getByText('GST 18% (18.000 %)')).toBeDefined()
    })

    const select = screen.getByLabelText(/Select tax rule/i)
    fireEvent.change(select, { target: { value: 'tax_2' } })

    expect(handleChange).toHaveBeenCalledWith('tax_2')
  })
})
