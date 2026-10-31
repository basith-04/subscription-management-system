import { useEffect, useState } from 'react'
import { listProducts } from '../../../api/products'
import { formatMoney } from '../../../lib/money'
import type { Product } from '../types'

export function ProductListPage({ navigate }: { navigate: (path: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProducts().then((res) => { if (!cancelled) setProducts(res.data) }).catch((e: Error) => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="page">
      <main style={{ padding: '2rem', width: 'min(1000px, calc(100% - 3rem))', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div><h1 style={{ fontSize: '1.8rem' }}>Products</h1><p style={{ color: '#6b675f' }}>Catalogue of products with variants.</p></div>
          <button className="button primary" onClick={() => navigate('/app/products/new')}>New product</button>
        </header>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#a33030' }}>{error}</p>}
        {!loading && !error && products.length === 0 && <p style={{ color: '#6b675f' }}>No products yet. Click "New product" to add one.</p>}
        {products.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2ded4' }}>
              <th style={{ padding: '0.75rem 0' }}>Name</th><th>Type</th><th style={{ textAlign: 'right' }}>Sales price</th><th style={{ textAlign: 'right' }}>Cost price</th><th style={{ textAlign: 'center' }}>Active</th>
            </tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} style={{ borderBottom: '1px solid #f2efe8', cursor: 'pointer' }} onClick={() => navigate(`/app/products/${product.id}`)}>
                  <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>{product.name}</td><td>{product.product_type}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(product.sales_price)}</td><td style={{ textAlign: 'right', color: '#6b675f' }}>{formatMoney(product.cost_price)}</td>
                  <td style={{ textAlign: 'center' }}>{product.is_active ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#6b675f' }}><a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>← Back home</a></p>
      </main>
    </div>
  )
}
