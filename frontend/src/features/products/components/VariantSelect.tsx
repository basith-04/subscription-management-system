import { useEffect, useState } from 'react'
import { listVariants } from '../../../api/products'
import type { ProductVariant } from '../types'

export function VariantSelect({ productId, value, onChange, disabled = false, placeholder = 'No variant (base price)' }: { productId: number | null; value: number | null; onChange: (variantId: number | null, variant: ProductVariant | null) => void; disabled?: boolean; placeholder?: string }) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  useEffect(() => {
    if (!productId) { setVariants([]); return }
    listVariants(productId).then(setVariants).catch(() => setVariants([]))
  }, [productId])
  return (
    <select value={value ?? ''} disabled={disabled || !productId} onChange={(e) => { const next = e.target.value ? Number(e.target.value) : null; onChange(next, variants.find((v) => v.id === next) ?? null) }} style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2ded4', borderRadius: 8, minWidth: 200 }}>
      <option value="">{placeholder}</option>
      {variants.map((v) => <option key={v.id} value={v.id}>{v.attribute_name}: {v.attribute_value} ({v.price_adjustment})</option>)}
    </select>
  )
}
