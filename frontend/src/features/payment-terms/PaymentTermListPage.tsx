import { useState, useEffect, useCallback } from 'react'
import {
  getPaymentTerms,
  createPaymentTerm,
  updatePaymentTerm,
  type PaymentTerm,
} from '../../lib/api/payment-terms.js'
import { useAuth, useCan } from '../../lib/auth-context.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js'
import { Toast } from '../../components/ui/Toast.js'
import { PaymentTermForm } from './PaymentTermForm.js'

export function PaymentTermListPage() {
  const { role } = useAuth()
  const canManageTerms = useCan('payment_terms:manage')

  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [deactivatingTerm, setDeactivatingTerm] = useState<PaymentTerm | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const loadTerms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filter =
        statusFilter === 'all'
          ? undefined
          : { is_active: statusFilter === 'active' }
      const data = await getPaymentTerms(filter, role)
      setTerms(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load payment terms'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, role])

  useEffect(() => {
    loadTerms()
  }, [loadTerms])

  const handleOpenCreate = () => {
    setEditingTerm(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (term: PaymentTerm) => {
    setEditingTerm(term)
    setIsFormOpen(true)
  }

  const handleFormSubmit = async (data: { name: string; due_days: number }) => {
    setIsSubmitting(true)
    try {
      if (editingTerm) {
        await updatePaymentTerm(editingTerm.id, data, role)
        setToast({ message: `Payment term "${data.name}" updated successfully`, type: 'success' })
      } else {
        await createPaymentTerm(data, role)
        setToast({ message: `Payment term "${data.name}" created successfully`, type: 'success' })
      }
      setIsFormOpen(false)
      setEditingTerm(null)
      await loadTerms()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setToast({ message: msg, type: 'error' })
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDeactivate = async () => {
    if (!deactivatingTerm) return
    const newActiveState = !deactivatingTerm.is_active
    const actionLabel = newActiveState ? 'reactivated' : 'deactivated'
    try {
      await updatePaymentTerm(deactivatingTerm.id, { is_active: newActiveState }, role)
      setToast({
        message: `Payment term "${deactivatingTerm.name}" ${actionLabel}`,
        type: 'success',
      })
      setDeactivatingTerm(null)
      await loadTerms()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${actionLabel}`
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
            Payment Terms
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>
            Configure credit and settlement terms driving invoice due dates.
          </p>
        </div>

        {canManageTerms && !isFormOpen && (
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
            + New Payment Term
          </button>
        )}
      </div>

      {!canManageTerms && (
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
          Viewing in <strong>Staff read-only mode</strong>. Only Admin accounts can create or modify payment terms.
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
          <PaymentTermForm
            initialData={editingTerm}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setIsFormOpen(false)
              setEditingTerm(null)
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
          Loading payment terms...
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
            onClick={loadTerms}
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
      {!loading && !error && terms.length === 0 && (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', color: '#111827' }}>No payment terms found</h3>
          <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
            {canManageTerms ? 'Add your first payment term' : 'No payment terms are currently configured.'}
          </p>
          {canManageTerms && (
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
              Add your first payment term
            </button>
          )}
        </div>
      )}

      {/* Terms Table */}
      {!loading && !error && terms.length > 0 && (
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
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Due Days</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Status</th>
                {canManageTerms && (
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
              {terms.map((term) => (
                <tr
                  key={term.id}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: '#111827' }}>
                    {term.name}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#374151' }}>
                    {term.due_days === 0 ? '0 days (Due on receipt)' : `${term.due_days} days`}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge isActive={term.is_active} />
                  </td>
                  {canManageTerms && (
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
                          onClick={() => handleOpenEdit(term)}
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
                          onClick={() => setDeactivatingTerm(term)}
                          style={{
                            padding: '4px 10px',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            color: term.is_active ? '#b45309' : '#15803d',
                          }}
                        >
                          {term.is_active ? 'Deactivate' : 'Reactivate'}
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

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingTerm)}
        title={deactivatingTerm?.is_active ? 'Deactivate Payment Term' : 'Reactivate Payment Term'}
        message={
          deactivatingTerm?.is_active
            ? `Are you sure you want to deactivate "${deactivatingTerm.name}"? Inactive payment terms cannot be selected for new quotation lines, but existing subscriptions are unaffected.`
            : `Are you sure you want to reactivate "${deactivatingTerm?.name}"? It will become available for new quotation lines.`
        }
        confirmLabel={deactivatingTerm?.is_active ? 'Deactivate' : 'Reactivate'}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivatingTerm(null)}
      />
    </div>
  )
}
