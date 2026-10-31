import { ProductSelect, VariantSelect } from '../features/products'
import { TaxSelect } from '../features/taxes'

/** Controlled, feature-independent line draft. `overridden` prevents catalogue changes from erasing an entered price. */
export interface LineItemDraft {
  key: string; product_id: number | null; variant_id: number | null; quantity: string
  unit_price: string; base_price: string; overridden: boolean; tax_rule_id: number | null
  product_is_active?: boolean; variant_is_active?: boolean | null; tax_rule_is_active?: boolean | null
}
export function lineAmount(price: string, quantity: string): string | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(price) || !/^[1-9]\d*$/.test(quantity)) return null
  const [whole = '0', fractional = ''] = price.split('.')
  const cents = (BigInt(whole) * 100n + BigInt((fractional + '00').slice(0, 2))) * BigInt(quantity)
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}
export function LineItemsEditor({ value, onChange, disabled = false, minimumQuantity, errors = {}, showTotals = false }: {
  value: LineItemDraft[]; onChange: (rows: LineItemDraft[]) => void; disabled?: boolean
  minimumQuantity?: number; errors?: Record<string, string>; showTotals?: boolean
}) {
  const change = (index: number, patch: Partial<LineItemDraft>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row))
  const move = (index: number, to: number) => { const next = [...value]; const [row] = next.splice(index, 1); if (row) { next.splice(to, 0, row); onChange(next) } }
  const amounts = value.map((row) => lineAmount(row.unit_price, row.quantity))
  const total = amounts.every((a) => a !== null) ? amounts.reduce<bigint>((sum, amount) => { const [a = '0', b = '00'] = amount!.split('.'); return sum + BigInt(a) * 100n + BigInt(b) }, 0n) : null
  return <section aria-label="Line items">
    <h2>Line items</h2>
    {value.length === 0 && <p>No lines yet.</p>}
    {value.map((row, index) => <fieldset key={row.key} disabled={disabled} style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
      <legend>Line {index + 1}</legend>
      <label>Product <ProductSelect value={row.product_id} onChange={(id, product) => change(index, { product_id: id, variant_id: null, base_price: product?.sales_price ?? '', unit_price: row.overridden ? row.unit_price : product?.sales_price ?? '', product_is_active: true, variant_is_active: null })} /></label>
      <label>Variant <VariantSelect productId={row.product_id} value={row.variant_id} onChange={(id, variant) => change(index, { variant_id: id, unit_price: row.overridden ? row.unit_price : variant?.effective_price ?? row.base_price, variant_is_active: variant?.is_active ?? null })} /></label>
      <label>Quantity <input type="number" min="1" max="2147483647" value={row.quantity} onChange={(e) => change(index, { quantity: e.target.value })} /></label>
      <label>Unit price <input inputMode="decimal" value={row.unit_price} onChange={(e) => change(index, { unit_price: e.target.value, overridden: true })} /></label>
      <label>Tax <TaxSelect value={row.tax_rule_id?.toString() ?? ''} onChange={(id) => change(index, { tax_rule_id: id ? Number(id) : null, tax_rule_is_active: null })} /></label>
      <span>Line amount: {amounts[index] ?? '—'}</span>
      {!row.product_id && <span role="status">Select a product.</span>}
      {(!/^[1-9]\d*$/.test(row.quantity) || Number(row.quantity) > 2147483647) && <span role="alert">Quantity must be a positive integer no greater than 2147483647.</span>}
      {row.unit_price && !/^\d{1,10}(\.\d{1,2})?$/.test(row.unit_price) && <span role="alert">Unit price must be non-negative with at most two decimal places.</span>}
      {(row.product_is_active === false || row.variant_is_active === false || row.tax_rule_is_active === false) && <span role="alert">A referenced product, variant or tax is inactive.</span>}
      {minimumQuantity && Number(row.quantity) < minimumQuantity && <span role="status">Quantity is below the plan minimum ({minimumQuantity}); quotation creation will validate it.</span>}
      {Object.entries(errors).filter(([field]) => field.startsWith(`items.${index}.`)).map(([field, message]) => <span role="alert" key={field}>{message}</span>)}
      <div><button type="button" disabled={index === 0} onClick={() => move(index, index - 1)}>Move up</button>{' '}
      <button type="button" disabled={index === value.length - 1} onClick={() => move(index, index + 1)}>Move down</button>{' '}
      <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button></div>
    </fieldset>)}
    {!disabled && <button type="button" onClick={() => onChange([...value, { key: crypto.randomUUID(), product_id: null, variant_id: null, quantity: '1', unit_price: '', base_price: '', overridden: false, tax_rule_id: null }])}>Add line</button>}
    {showTotals && <p>Subtotal: {total === null ? '—' : `${total / 100n}.${String(total % 100n).padStart(2, '0')}`}</p>}
  </section>
}
