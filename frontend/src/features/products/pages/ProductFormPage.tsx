import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createProduct, type CreateProductInput } from '../../../api/products'
import { ProductFormField } from '../components/ProductFormField'
import { ProductPageHeader } from '../components/ProductPageHeader'

const PRODUCT_TYPES: CreateProductInput['product_type'][] = ['service', 'software', 'addon', 'physical']

export function ProductFormPage() {
  const navigate = useNavigate()
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
    <main className="products-page products-page--narrow">
      <ProductPageHeader title="New product" backTo="/app/products" backLabel="Products" />
      <form onSubmit={handleSubmit} className="products-form">
          <ProductFormField label="Name"><input required minLength={1} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /></ProductFormField>
          <ProductFormField label="Type"><select value={productType} onChange={(e) => setProductType(e.target.value as CreateProductInput['product_type'])}>{PRODUCT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></ProductFormField>
          <div className="products-price-grid">
            <ProductFormField label="Sales price"><input required value={salesPrice} onChange={(e) => setSalesPrice(e.target.value)} pattern="^\d{1,10}(\.\d{1,2})?$" /></ProductFormField>
            <ProductFormField label="Cost price"><input required value={costPrice} onChange={(e) => setCostPrice(e.target.value)} pattern="^\d{1,10}(\.\d{1,2})?$" /></ProductFormField>
          </div>
          <ProductFormField label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></ProductFormField>
          {error && <p className="products-error">{error}</p>}
          <div className="products-form-actions">
            <Link className="button ghost" to="/app/products">Cancel</Link>
            <button type="submit" className="button primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create product'}</button>
          </div>
      </form>
    </main>
  )
}
