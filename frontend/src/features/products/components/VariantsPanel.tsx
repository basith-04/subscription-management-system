import { useState } from 'react'
import { addVariant } from '../../../api/products'
import { formatMoney } from '../../../lib/money'
import { useAuth } from '../../auth/useAuth'
import type { Product } from '../types'

export function VariantsPanel({ product, onVariantsChanged }: { product: Product; onVariantsChanged: () => void }) {
  const { user } = useAuth()
  const [attributeName, setAttributeName] = useState('')
  const [attributeValue, setAttributeValue] = useState('')
  const [adjustment, setAdjustment] = useState('0.00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variants = product.variants ?? []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setSubmitting(true)
    try {
      await addVariant(product.id, { attribute_name: attributeName.trim(), attribute_value: attributeValue.trim(), price_adjustment: adjustment.trim() })
      setAttributeName(''); setAttributeValue(''); setAdjustment('0.00'); onVariantsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add variant')
    } finally { setSubmitting(false) }
  }

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Variants</h2>
      {variants.length === 0 && <p style={{ color: '#6b675f', marginBottom: '1rem' }}>No variants — the base price applies.</p>}
      {variants.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem', marginBottom: '1rem' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2ded4' }}>
            <th style={{ padding: '0.5rem 0' }}>Attribute</th><th>Value</th><th style={{ textAlign: 'right' }}>Adjustment</th><th style={{ textAlign: 'right' }}>Effective price</th><th style={{ textAlign: 'center' }}>Active</th>
          </tr></thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #f2efe8' }}>
                <td style={{ padding: '0.5rem 0' }}>{v.attribute_name}</td><td>{v.attribute_value}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(v.price_adjustment)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(v.effective_price)}</td>
                <td style={{ textAlign: 'center' }}>{v.is_active ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {user?.role === 'admin' && <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b675f' }}>Attribute</span>
          <input required value={attributeName} onChange={(e) => setAttributeName(e.target.value)} placeholder="Brand" style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2ded4', borderRadius: 8 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b675f' }}>Value</span>
          <input required value={attributeValue} onChange={(e) => setAttributeValue(e.target.value)} placeholder="Odoo" style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2ded4', borderRadius: 8 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b675f' }}>Adjustment</span>
          <input required value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="560.00" pattern="^-?\d{1,10}(\.\d{1,2})?$" style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2ded4', borderRadius: 8, width: 100 }} />
        </label>
        <button type="submit" disabled={submitting} className="button primary">{submitting ? 'Adding…' : 'Add variant'}</button>
      </form>}
      {error && <p style={{ color: '#a33030', marginTop: '0.5rem' }}>{error}</p>}
    </section>
  )
}
