import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TaxListPage } from './TaxListPage.js'
import { AuthProvider } from '../../lib/auth-context.js'
import * as taxApi from '../../lib/api/taxes.js'

describe('TaxListPage RBAC Rendering', () => {
  const mockTaxes: taxApi.TaxRule[] = [
    {
      id: '1',
      name: 'GST 18%',
      rate: '18.000',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(taxApi, 'getTaxes').mockResolvedValue(mockTaxes)
  })

  it('renders management controls when user has Admin role', async () => {
    render(
      <AuthProvider initialRole="admin">
        <TaxListPage />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('GST 18%')).toBeDefined()
    })

    // Admin should see creation button and action buttons
    expect(screen.getByRole('button', { name: /\+ New Tax Rule/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Edit/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Deactivate/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Delete/i })).toBeDefined()
  })

  it('hides write/edit/delete controls when user has Staff role', async () => {
    render(
      <AuthProvider initialRole="staff">
        <TaxListPage />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('GST 18%')).toBeDefined()
    })

    // Staff should see read-only banner and NOT see management buttons
    expect(screen.getByText(/Staff read-only mode/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: /\+ New Tax Rule/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Deactivate/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete/i })).toBeNull()
  })
})
