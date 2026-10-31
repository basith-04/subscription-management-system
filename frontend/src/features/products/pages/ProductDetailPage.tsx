import { useEffect, useState } from 'react'
import { getProduct } from '../../../api/products'
import { formatMoney } from '../../../lib/money'
import type { Product } from '../types'
import { ProductPageHeader } from '../components/ProductPageHeader'
import { VariantsPanel } from '../components/VariantsPanel'

export function ProductDetailPage({ id }: { id: number }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = () => { getProduct(id).then(setProduct).catch((e: Error) => setError(e.message)) }
  useEffect(reload, [id])

  if (error) return <main className="products-page products-error">{error}</main>
  if (!product) return <main className="products-page">Loading…</main>

  return (
    <main className="products-page">
      <ProductPageHeader title={product.name} description={`${product.product_type} · ${product.is_active ? 'active' : 'inactive'}`} backTo="/app/products" backLabel="Products" />
      <div className="products-price-grid">
          <Stat label="Sales price" value={formatMoney(product.sales_price)} />
          <Stat label="Cost price" value={formatMoney(product.cost_price)} />
      </div>
      <VariantsPanel product={product} onVariantsChanged={reload} />
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="products-stat">
      <div className="products-stat-label">{label}</div>
      <div className="products-stat-value">{value}</div>
    </div>
  )
}
