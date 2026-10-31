import { useState } from 'react'
import { createProduct, type CreateProductInput } from '../../../api/products'

const PRODUCT_TYPES: CreateProductInput['product_type'][] = ['service', 'software', 'addon', 'physical']

export function ProductFormPage({ navigate }: { navigate: (path: string) => void }) {
  const [name, setName] = useState(''); const [productType, setProductType] = useState<CreateProductInput['product_type']>('software')
  const [salesPrice, setSalesPrice] = useState('0.00'); const [costPrice, setCostPrice] = useState('0.00')
  const [notes, setNotes] = useState(''); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSubmitting(true)
    try {
      const product = await createProduct({ name: name.trim(), product_type: productType, sales_price: salesPrice.trim(), cost_price: costPrice.trim(), notes: notes.trim() || undefined })
      navigate(`/app/products/${product.id}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create product') } finally { setSubmitting(false) }
  }

  return (
    <div className="page">
      <main style={{ padding: '2rem', width: 'min(700px, calc(100% - 3rem))', margin: '0 auto' }}>
        <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#6b675f' }}><a href="/app/products" onClick={(e) => { e.preventDefault(); navigate('/app/products') }}>← Products</a></p>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>New product</h1>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <Field label="Name"><input required minLength={1} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
          <Field label="Type"><select value={productType} onChange={(e) => setProductType(e.target.value as CreateProductInput['product_type'])} style={inputStyle}>{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Sales price"><input required value={salesPrice} onChange={(e) => setSalesPrice(e.target.value)} pattern="^\d{1,10}(\.\d{1,2})?$" style={inputStyle} /></Field>
            <Field label="Cost price"><input required value={costPrice} onChange={(e) => setCostPrice(e.target.value)} pattern="^\d{1,10}(\.\d{1,2})?$" style={inputStyle} /></Field>
          </div>
          <Field label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
          {error && <p style={{ color: '#a33030' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="button ghost" onClick={() => navigate('/app/products')}>Cancel</button>
            <button type="submit" className="button primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create product'}</button>
          </div>
        </form>
      </main>
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '0.5rem 0.7rem', border: '1px solid #e2ded4', borderRadius: 8, fontSize: '0.95rem', width: '100%' }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}><span style={{ fontSize: '0.85rem', color: '#6b675f' }}>{label}</span>{children}</label>
}
