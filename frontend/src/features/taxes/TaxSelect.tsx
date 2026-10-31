import { useState, useEffect } from 'react'
import { getTaxes, formatTaxRate, type TaxRule } from '../../lib/api/taxes.js'

export interface TaxSelectProps {
  id?: string
  name?: string
  value?: string
  onChange: (taxId: string) => void
  disabled?: boolean
  required?: boolean
  roleHeader?: string
}

export function TaxSelect({
  id = 'tax-select',
  name = 'tax_rule_id',
  value,
  onChange,
  disabled = false,
  required = false,
  roleHeader,
}: TaxSelectProps) {
  const [taxes, setTaxes] = useState<TaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getTaxes({ is_active: true }, roleHeader)
      .then((data) => {
        if (!cancelled) {
          setTaxes(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load taxes')
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
        aria-label="Select tax rule"
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
          {loading ? 'Loading active taxes...' : '-- Select a tax rule --'}
        </option>
        {taxes.map((tax) => (
          <option key={tax.id} value={tax.id}>
            {tax.name} ({formatTaxRate(tax.rate)})
          </option>
        ))}
      </select>
      {error && (
        <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>{error}</span>
      )}
    </div>
  )
}
