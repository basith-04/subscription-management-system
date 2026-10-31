import { useId } from 'react'
import { defaultSlots, type ProductEditorSlots } from './product-slots'
import type { ProductRowDraft } from '../types'

interface Props {
  rows: ProductRowDraft[]
  onChange: (rows: ProductRowDraft[]) => void
  /** Row index → validation message. */
  errors?: Record<number, string>
  readOnly?: boolean
  disabled?: boolean
  /** F06/F00 shared inputs; defaults are temporary stand-ins (see product-slots.tsx). */
  slots?: ProductEditorSlots
}

let rowCounter = 0
export const newRowKey = () => `row-${++rowCounter}`

export function emptyRow(): ProductRowDraft {
  return { key: newRowKey(), product_id: null, variant_id: null, default_quantity: '1', unit_price_override: '' }
}

export function PlanProductsEditor({
  rows,
  onChange,
  errors = {},
  readOnly = false,
  disabled = false,
  slots = defaultSlots,
}: Props) {
  const uid = useId()
  const { ProductSelect, VariantSelect, MoneyInput } = slots
  const update = (index: number, patch: Partial<ProductRowDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  if (readOnly) {
    return rows.length === 0 ? (
      <p className="plans-empty">No products attached</p>
    ) : (
      <table className="plans-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Variant</th>
            <th>Default quantity</th>
            <th>Price override</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                {row.product_name ?? `#${row.product_id}`}
                {row.product_is_active === false && <span className="plans-badge"> inactive</span>}
              </td>
              <td>{row.variant_label ?? '—'}</td>
              <td>{row.default_quantity}</td>
              <td>{row.unit_price_override || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="plans-products-editor">
      {rows.length === 0 && <p className="plans-empty">No products attached</p>}
      <ul className="plans-product-rows">
        {rows.map((row, i) => (
          <li key={row.key} aria-label={`Product row ${i + 1}`}>
            <div className="plans-product-row">
              <ProductSelect
                id={`${uid}-p-${row.key}`}
                label={`Product for row ${i + 1}`}
                value={row.product_id}
                disabled={disabled}
                onChange={(product_id, hint) =>
                  update(i, { product_id, variant_id: null, variant_label: null, product_name: hint?.name ?? null })
                }
              />
              <VariantSelect
                id={`${uid}-v-${row.key}`}
                label={`Variant for row ${i + 1}`}
                productId={row.product_id}
                value={row.variant_id}
                disabled={disabled}
                onChange={(variant_id, hint) => update(i, { variant_id, variant_label: hint?.label ?? null })}
              />
              <input
                aria-label={`Default quantity for row ${i + 1}`}
                type="number"
                min={1}
                value={row.default_quantity}
                disabled={disabled}
                onChange={(e) => update(i, { default_quantity: e.target.value })}
              />
              <MoneyInput
                id={`${uid}-m-${row.key}`}
                label={`Price override for row ${i + 1}`}
                placeholder="Price override (optional)"
                value={row.unit_price_override}
                disabled={disabled}
                onChange={(unit_price_override) => update(i, { unit_price_override })}
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove row ${i + 1}`}
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
            {row.product_is_active === false && (
              <p className="plans-warning" role="note">
                This product is inactive. Remove it before saving.
              </p>
            )}
            {errors[i] && (
              <p className="plans-error" role="alert">
                {errors[i]}
              </p>
            )}
          </li>
        ))}
      </ul>
      <button type="button" disabled={disabled} onClick={() => onChange([...rows, emptyRow()])}>
        Add product
      </button>
    </div>
  )
}
