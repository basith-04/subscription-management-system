import { useEffect, useState } from 'react'
import { getProduct } from '../../../api/products'
import { formatMoney } from '../../../lib/money'
import type { Product } from '../types'
import { VariantsPanel } from '../components/VariantsPanel'

export function ProductDetailPage({ id, navigate }: { id: number; navigate: (path: string) => void }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = () => { getProduct(id).then(setProduct).catch((e: Error) => setError(e.message)) }
  useEffect(reload, [id])

  if (error) return <div style={{ padding: '2rem', color: '#a33030' }}>{error}</div>
  if (!product) return <div style={{ padding: '2rem' }}>Loading…</div>

  return (
    <div className="page">
      <main style={{ padding: '2rem', width: 'min(1000px, calc(100% - 3rem))', margin: '0 auto' }}>
        <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#6b675f' }}><a href="/app/products" onClick={(e) => { e.preventDefault(); navigate('/app/products') }}>← Products</a></p>
        <h1 style={{ fontSize: '1.8rem' }}>{product.name}</h1>
        <p style={{ color: '#6b675f', marginBottom: '1.5rem' }}>{product.product_type} · {product.is_active ? 'active' : 'inactive'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <Stat label="Sales price" value={formatMoney(product.sales_price)} />
          <Stat label="Cost price" value={formatMoney(product.cost_price)} />
        </div>
        <VariantsPanel product={product} onVariantsChanged={reload} />
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #e2ded4', borderRadius: 12, padding: '1rem', background: '#fff' }}>
      <div style={{ fontSize: '0.8rem', color: '#6b675f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '0.25rem' }}>{value}</div>
    </div>
  )
}
