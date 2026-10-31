import { useState, useEffect } from 'react'
import { getPaymentTerms, type PaymentTerm } from '../../lib/api/payment-terms.js'

export interface PaymentTermSelectProps {
  id?: string
  name?: string
  value?: string
  onChange: (termId: string) => void
  disabled?: boolean
  required?: boolean
  roleHeader?: string
}

export function PaymentTermSelect({
  id = 'payment-term-select',
  name = 'payment_term_id',
  value,
  onChange,
  disabled = false,
  required = false,
  roleHeader,
}: PaymentTermSelectProps) {
  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getPaymentTerms({ is_active: true }, roleHeader)
      .then((data) => {
        if (!cancelled) {
          setTerms(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load payment terms')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [roleHeader])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <select
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        required={required}
        aria-label="Select payment term"
        style={{
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          fontSize: '0.95rem',
          backgroundColor: '#ffffff',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        <option value="">
          {loading ? 'Loading active terms...' : '-- Select payment terms --'}
        </option>
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.name} ({term.due_days === 0 ? 'Due on receipt' : `${term.due_days} days`})
          </option>
        ))}
      </select>
      {error && (
        <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>{error}</span>
      )}
    </div>
  )
}
