import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaymentTermForm } from './PaymentTermForm.js'

describe('PaymentTermForm Component', () => {
  it('renders form fields for name and due days', () => {
    render(<PaymentTermForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/Term Name/i)).toBeDefined()
    expect(screen.getByLabelText(/Due Days/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Create Term/i })).toBeDefined()
  })

  it('validates required name field', async () => {
    const handleSubmit = vi.fn()
    render(<PaymentTermForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Create Term/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
      expect(screen.getByText(/Payment term name is required/i)).toBeDefined()
    })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('validates due days must be non-negative integer', async () => {
    const handleSubmit = vi.fn()
    render(<PaymentTermForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Term Name/i), {
      target: { value: 'Net Negative' },
    })
    fireEvent.change(screen.getByLabelText(/Due Days/i), {
      target: { value: '-10' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Term/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/greater than or equal to 0/i),
      ).toBeDefined()
    })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('submits valid data with integer due days', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined)
    render(<PaymentTermForm onSubmit={handleSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Term Name/i), {
      target: { value: 'Net 30' },
    })
    fireEvent.change(screen.getByLabelText(/Due Days/i), {
      target: { value: '30' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Term/i }))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        name: 'Net 30',
        due_days: 30,
      })
    })
  })
})
