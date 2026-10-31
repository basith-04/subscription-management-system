import { useState, type FormEvent } from 'react'
import type { PaymentTerm } from '../../lib/api/payment-terms.js'

export interface PaymentTermFormProps {
  initialData?: PaymentTerm | null
  onSubmit: (data: { name: string; due_days: number }) => Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
}

export function PaymentTermForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PaymentTermFormProps) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [dueDays, setDueDays] = useState(
    initialData?.due_days !== undefined ? String(initialData.due_days) : '',
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Payment term name is required')
      return
    }

    const trimmedDays = dueDays.trim()
    if (!trimmedDays) {
      setError('Due days is required')
      return
    }

    const parsedDays = Number(trimmedDays)
    if (!Number.isInteger(parsedDays) || parsedDays < 0) {
      setError('Due days must be an integer greater than or equal to 0')
      return
    }

    try {
      await onSubmit({ name: trimmedName, due_days: parsedDays })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save payment term'
      setError(msg)
    }
  }

  const isEditing = Boolean(initialData)

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '500px',
        width: '100%',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#111827' }}>
        {isEditing ? 'Edit Payment Term' : 'New Payment Term'}
      </h3>

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="term-name"
          style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.875rem' }}
        >
          Term Name *
        </label>
        <input
          id="term-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Net 30"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="term-due-days"
          style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.875rem' }}
        >
          Due Days *
        </label>
        <input
          id="term-due-days"
          type="number"
          min="0"
          step="1"
          value={dueDays}
          onChange={(e) => setDueDays(e.target.value)}
          placeholder="0"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            boxSizing: 'border-box',
          }}
        />
        <small style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
          Number of days until invoice due date (0 = Due on receipt)
        </small>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: '#ffffff',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Term' : 'Create Term'}
        </button>
      </div>
    </form>
  )
}
