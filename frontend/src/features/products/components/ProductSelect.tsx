import { useEffect, useState } from 'react'
import { listProducts } from '../../../api/products'
import type { Product } from '../types'

export function ProductSelect({ value, onChange, activeOnly = true, disabled = false, placeholder = 'Select a product' }: { value: number | null; onChange: (productId: number | null, product: Product | null) => void; activeOnly?: boolean; disabled?: boolean; placeholder?: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listProducts({ is_active: activeOnly ? true : undefined, page_size: 100 }).then((res) => setProducts(res.data)).catch((e: Error) => setError(e.message))
  }, [activeOnly])
  return (
    <select value={value ?? ''} disabled={disabled} onChange={(e) => { const next = e.target.value ? Number(e.target.value) : null; onChange(next, products.find((p) => p.id === next) ?? null) }} style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2ded4', borderRadius: 8, minWidth: 200 }}>
      <option value="">{placeholder}</option>
      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      {error && <option disabled>Error loading products</option>}
    </select>
  )
}
