import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listProducts } from '../../../api/products'
import { formatMoney } from '../../../lib/money'
import { useAuth } from '../../auth/useAuth'
import { ProductPageHeader } from '../components/ProductPageHeader'
import type { Product } from '../types'

export function ProductListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProducts().then((res) => { if (!cancelled) setProducts(res.data) }).catch((e: Error) => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="products-page">
      <ProductPageHeader
        title="Products"
        description="Catalogue of products with variants."
        actions={user?.role === 'admin' && <button className="button primary" onClick={() => navigate('/app/products/new')}>New product</button>}
      />
        {loading && <p>Loading…</p>}
        {error && <p className="products-error">{error}</p>}
        {!loading && !error && products.length === 0 && <p className="products-muted">No products yet. {user?.role === 'admin' && 'Click “New product” to add one.'}</p>}
        {products.length > 0 && (
          <table className="products-table">
            <thead><tr>
              <th>Name</th><th>Type</th><th className="numeric">Sales price</th><th className="numeric">Cost price</th><th className="centered">Active</th>
            </tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><Link to={`/app/products/${product.id}`}>{product.name}</Link></td><td>{product.product_type}</td>
                  <td className="numeric">{formatMoney(product.sales_price)}</td><td className="numeric products-muted">{formatMoney(product.cost_price)}</td>
                  <td className="centered">{product.is_active ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <p><Link className="products-back-link" to="/">← Back home</Link></p>
    </main>
  )
}
