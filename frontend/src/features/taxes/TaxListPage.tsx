import { useState, useEffect, useCallback } from 'react'
import {
  getTaxes,
  createTax,
  updateTax,
  deleteTax,
  formatTaxRate,
  type TaxRule,
} from '../../lib/api/taxes.js'
import { useAuth, useCan } from '../../lib/auth-context.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js'
import { Toast } from '../../components/ui/Toast.js'
import { TaxForm } from './TaxForm.js'

export function TaxListPage() {
  const { role } = useAuth()
  const canManageTaxes = useCan('taxes:manage')

  const [taxes, setTaxes] = useState<TaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTax, setEditingTax] = useState<TaxRule | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [deactivatingTax, setDeactivatingTax] = useState<TaxRule | null>(null)
  const [deletingTax, setDeletingTax] = useState<TaxRule | null>(null)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const loadTaxes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filter =
        statusFilter === 'all'
          ? undefined
          : { is_active: statusFilter === 'active' }
      const data = await getTaxes(filter, role)
      setTaxes(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load taxes'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, role])

  useEffect(() => {
    loadTaxes()
  }, [loadTaxes])

  const handleOpenCreate = () => {
    setEditingTax(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (tax: TaxRule) => {
    setEditingTax(tax)
    setIsFormOpen(true)
  }

  const handleFormSubmit = async (data: { name: string; rate: string }) => {
    setIsSubmitting(true)
    try {
      if (editingTax) {
        await updateTax(editingTax.id, data, role)
        setToast({ message: `Tax rule "${data.name}" updated successfully`, type: 'success' })
      } else {
        await createTax(data, role)
        setToast({ message: `Tax rule "${data.name}" created successfully`, type: 'success' })
      }
      setIsFormOpen(false)
      setEditingTax(null)
      await loadTaxes()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setToast({ message: msg, type: 'error' })
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDeactivate = async () => {
    if (!deactivatingTax) return
    const newActiveState = !deactivatingTax.is_active
    const actionLabel = newActiveState ? 'reactivated' : 'deactivated'
    try {
      await updateTax(deactivatingTax.id, { is_active: newActiveState }, role)
      setToast({
        message: `Tax rule "${deactivatingTax.name}" ${actionLabel}`,
        type: 'success',
      })
      setDeactivatingTax(null)
      await loadTaxes()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${actionLabel}`
      setToast({ message: msg, type: 'error' })
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingTax) return
    try {
      await deleteTax(deletingTax.id, role)
      setToast({ message: `Tax rule "${deletingTax.name}" deleted successfully`, type: 'success' })
      setDeletingTax(null)
      await loadTaxes()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete'
      setToast({ message: msg, type: 'error' })
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.75rem', color: '#111827' }}>
            Tax Rules
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>
            Configure standard tax rates for subscription quotation lines and invoices.
          </p>
        </div>

        {canManageTaxes && !isFormOpen && (
          <button
            type="button"
            onClick={handleOpenCreate}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Tax Rule
          </button>
        )}
      </div>

      {!canManageTaxes && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            color: '#4b5563',
            fontSize: '0.875rem',
            marginBottom: '16px',
          }}
        >
          Viewing in <strong>Staff read-only mode</strong>. Only Admin accounts can create or modify tax rules.
        </div>
      )}

      {/* Form Modal / Panel */}
      {isFormOpen && (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <TaxForm
            initialData={editingTax}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setIsFormOpen(false)
              setEditingTax(null)
            }}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#4b5563' }}>Status:</span>
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            border: '1px solid #d1d5db',
            background: statusFilter === 'all' ? '#2563eb' : '#ffffff',
            color: statusFilter === 'all' ? '#ffffff' : '#374151',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('active')}
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            border: '1px solid #d1d5db',
            background: statusFilter === 'active' ? '#2563eb' : '#ffffff',
            color: statusFilter === 'active' ? '#ffffff' : '#374151',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('inactive')}
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            border: '1px solid #d1d5db',
            background: statusFilter === 'inactive' ? '#2563eb' : '#ffffff',
            color: statusFilter === 'inactive' ? '#ffffff' : '#374151',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Inactive
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          Loading tax rules...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          role="alert"
          style={{
            padding: '20px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#dc2626',
          }}
        >
          <p style={{ margin: '0 0 12px 0' }}>{error}</p>
          <button
            type="button"
            onClick={loadTaxes}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && taxes.length === 0 && (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', color: '#111827' }}>No tax rules found</h3>
          <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
            {canManageTaxes ? 'Add your first tax' : 'No tax rules are currently configured.'}
          </p>
          {canManageTaxes && (
            <button
              type="button"
              onClick={handleOpenCreate}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Add your first tax
            </button>
          )}
        </div>
      )}

      {/* Taxes Table */}
      {!loading && !error && taxes.length > 0 && (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.95rem',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Rate</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Status</th>
                {canManageTaxes && (
                  <th
                    style={{
                      padding: '12px 16px',
                      fontWeight: 600,
                      color: '#374151',
                      textAlign: 'right',
                    }}
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {taxes.map((tax) => (
                <tr
                  key={tax.id}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: '#111827' }}>
                    {tax.name}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#374151', fontFamily: 'monospace' }}>
                    {formatTaxRate(tax.rate)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge isActive={tax.is_active} />
                  </td>
                  {canManageTaxes && (
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '8px',
                          alignItems: 'center',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tax)}
                          style={{
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeactivatingTax(tax)}
                          style={{
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            color: tax.is_active ? '#b45309' : '#15803d',
                          }}
                        >
                          {tax.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTax(tax)}
                          style={{
                            padding: '4px 10px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            color: '#dc2626',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingTax)}
        title={deactivatingTax?.is_active ? 'Deactivate Tax Rule' : 'Reactivate Tax Rule'}
        message={
          deactivatingTax?.is_active
            ? `Are you sure you want to deactivate "${deactivatingTax.name}"? Inactive tax rules cannot be selected for new quotation lines, but existing lines and historical invoices are preserved.`
            : `Are you sure you want to reactivate "${deactivatingTax?.name}"? It will become available for new quotation lines.`
        }
        confirmLabel={deactivatingTax?.is_active ? 'Deactivate' : 'Reactivate'}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivatingTax(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingTax)}
        title="Delete Tax Rule"
        message={`Are you sure you want to permanently delete "${deletingTax?.name}"? If this tax rule is referenced by existing subscription items or templates, deletion will be blocked and you should deactivate it instead.`}
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingTax(null)}
      />
    </div>
  )
}
