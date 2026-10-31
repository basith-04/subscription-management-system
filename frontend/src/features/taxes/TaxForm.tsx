import { useState, type FormEvent } from 'react'
import type { TaxRule } from '../../lib/api/taxes.js'

export interface TaxFormProps {
  initialData?: TaxRule | null
  onSubmit: (data: { name: string; rate: string }) => Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
}

export function TaxForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: TaxFormProps) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [rate, setRate] = useState(initialData?.rate ?? '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Tax name is required')
      return
    }

    const trimmedRate = rate.trim()
    const rateRegex = /^\d{1,3}(\.\d{1,3})?$/
    if (!rateRegex.test(trimmedRate)) {
      setError('Rate must match format ^\\d{1,3}(\\.\\d{1,3})?$ (e.g. 18 or 18.000)')
      return
    }

    const numRate = Number.parseFloat(trimmedRate)
    if (numRate < 0 || numRate > 100) {
      setError('Rate must be between 0 and 100 inclusive')
      return
    }

    try {
      await onSubmit({ name: trimmedName, rate: trimmedRate })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save tax rule'
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
        {isEditing ? 'Edit Tax Rule' : 'New Tax Rule'}
      </h3>

      {isEditing && (
        <div
          role="note"
          style={{
            padding: '12px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            color: '#92400e',
            fontSize: '0.875rem',
            lineHeight: 1.4,
          }}
        >
          <strong>Notice:</strong> When a tax rate is updated, existing invoices retain
          their original tax rate. Only future invoices will use the updated rate.
        </div>
      )}

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
          htmlFor="tax-name"
          style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.875rem' }}
        >
          Tax Name *
        </label>
        <input
          id="tax-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. GST 18%"
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
          htmlFor="tax-rate"
          style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '0.875rem' }}
        >
          Tax Rate (percentage) *
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            id="tax-rate"
            type="text"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 18.000"
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ fontWeight: 600, color: '#4b5563' }}>%</span>
        </div>
        <small style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
          0 to 100 with up to 3 decimal places (e.g. 18.000)
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
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Tax' : 'Create Tax'}
        </button>
      </div>
    </form>
  )
}
