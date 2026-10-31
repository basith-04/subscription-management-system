import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaxForm } from './TaxForm.js'
import { formatTaxRate } from '../../lib/api/taxes.js'

describe('Tax Rate Formatting', () => {
  it('formats rates as 18.000 %', () => {
    expect(formatTaxRate('18.000')).toBe('18.000 %')
    expect(formatTaxRate('5')).toBe('5.000 %')
    expect(formatTaxRate(12.5)).toBe('12.500 %')
  })
})

describe('TaxForm Component', () => {
  it('renders form fields for name and rate', () => {
    render(<TaxForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/Tax Name/i)).toBeDefined()
    expect(screen.getByLabelText(/Tax Rate/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Create Tax/i })).toBeDefined()
  })

  it('validates required name field', async () => {
    const handleSubmit = vi.fn()
    render(<TaxForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Create Tax/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
      expect(screen.getByText(/Tax name is required/i)).toBeDefined()
    })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('validates rate format and range', async () => {
    const handleSubmit = vi.fn()
    render(<TaxForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Tax Name/i), {
      target: { value: 'VAT 10%' },
    })
    fireEvent.change(screen.getByLabelText(/Tax Rate/i), {
      target: { value: '150' }, // Out of range > 100
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Tax/i }))

    await waitFor(() => {
      expect(screen.getByText(/between 0 and 100/i)).toBeDefined()
    })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('submits valid data', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined)
    render(<TaxForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Tax Name/i), {
      target: { value: 'GST 18%' },
    })
    fireEvent.change(screen.getByLabelText(/Tax Rate/i), {
      target: { value: '18.000' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Tax/i }))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        name: 'GST 18%',
        rate: '18.000',
      })
    })
  })

  it('displays notice about existing invoices when editing', () => {
    render(
      <TaxForm
        initialData={{
          id: '1',
          name: 'GST 18%',
          rate: '18.000',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('note')).toBeDefined()
    expect(
      screen.getByText(/existing invoices retain their original tax rate/i),
    ).toBeDefined()
  })
})
