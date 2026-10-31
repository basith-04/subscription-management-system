// Line editor for quotations. F08 will ship the shared `LineItemsEditor`; until it lands this adapter provides the same
// behaviour on top of the shared ProductSelect / VariantSelect so F09 is not blocked. Swap the body for F08's component
// (same props: rows in, rows out) when it merges — nothing else in F09 depends on this file's internals.
import { ProductSelect, VariantSelect } from '../../products'
import { newRow, type LineRow } from '../lineRow'
import { computeLine, computeTotals, effectivePrice, isMoney } from '../money'
import type { TaxRuleOption } from '../types'

export interface QuotationLinesEditorProps {
  rows: LineRow[]
  onChange: (rows: LineRow[]) => void
  taxRules: TaxRuleOption[]
  /** Plan minimum quantity; lines below it are flagged (the server enforces it). */
  minQuantity?: number
  disabled?: boolean
  /** Server errors keyed by row index. */
  rowErrors?: Record<number, string>
}

export function QuotationLinesEditor({ rows, onChange, taxRules, minQuantity = 1, disabled, rowErrors = {} }: QuotationLinesEditorProps) {
  const patch = (key: string, change: Partial<LineRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...change } : r)))
  const rate = (r: LineRow) => taxRules.find((t) => t.id === r.tax_rule_id)?.rate ?? null
  const results = rows.map((r) => computeLine({ quantity: r.quantity, unit_price: r.unit_price, tax_rate: rate(r) }))
  const totals = computeTotals(results)

  return (
    <fieldset className="sub-lines" disabled={disabled}>
      <legend>Lines</legend>
      {rows.length === 0 && <p className="sub-muted">No lines yet.</p>}
      {rows.map((r, i) => {
        const qtyBad = !/^[1-9]\d{0,9}$/.test(r.quantity.trim())
        const belowMin = !qtyBad && Number(r.quantity) < minQuantity
        const priceBad = r.unit_price !== '' && !isMoney(r.unit_price)
        const err = rowErrors[i]
        return (
          <div className="sub-line" key={r.key} role="group" aria-label={`Line ${i + 1}`}>
            <div className="sub-line__field"><span>Product</span>
              <ProductSelect value={r.product_id} onChange={(id, p) => patch(r.key, {
                product_id: id, variant_id: null, salesPrice: p?.sales_price, adjustment: null,
                ...(r.priceEdited ? {} : { unit_price: p ? (effectivePrice(p.sales_price, null) ?? '') : '' }),
              })} /></div>
            <div className="sub-line__field"><span>Variant</span>
              <VariantSelect productId={r.product_id} value={r.variant_id} onChange={(id, v) => patch(r.key, {
                variant_id: id, adjustment: v?.price_adjustment ?? null,
                ...(r.priceEdited || !r.salesPrice ? {} : { unit_price: effectivePrice(r.salesPrice, v?.price_adjustment ?? null) ?? '' }),
              })} /></div>
            <label>Quantity
              <input inputMode="numeric" aria-label={`Quantity line ${i + 1}`} value={r.quantity} aria-invalid={qtyBad || belowMin}
                onChange={(e) => patch(r.key, { quantity: e.target.value })} /></label>
            <label>Unit price
              <input inputMode="decimal" aria-label={`Unit price line ${i + 1}`} value={r.unit_price} aria-invalid={priceBad}
                onChange={(e) => patch(r.key, { unit_price: e.target.value, priceEdited: true })} /></label>
            <label>Tax
              <select aria-label={`Tax line ${i + 1}`} value={r.tax_rule_id ?? ''} onChange={(e) => patch(r.key, { tax_rule_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No tax</option>
                {taxRules.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
              </select></label>
            <div className="sub-line__total"><span>Line total</span><output aria-label={`Line total ${i + 1}`}>{results[i]?.line_total ?? '—'}</output></div>
            <button type="button" className="sub-link" aria-label={`Remove line ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>Remove</button>
            {qtyBad && <p role="alert" className="sub-field-error">Quantity must be a whole number of at least 1</p>}
            {belowMin && <p role="alert" className="sub-field-error">The plan requires a quantity of at least {minQuantity}</p>}
            {priceBad && <p role="alert" className="sub-field-error">Price must have at most 2 decimals</p>}
            {err && <p role="alert" className="sub-field-error">{err}</p>}
          </div>
        )
      })}
      <button type="button" onClick={() => onChange([...rows, newRow()])}>Add line</button>
      <dl className="sub-totals" aria-label="Line totals">
        <div><dt>Subtotal</dt><dd data-testid="editor-subtotal">{totals.subtotal}</dd></div>
        <div><dt>Estimated tax</dt><dd data-testid="editor-tax">{totals.estimated_tax}</dd></div>
        <div className="sub-totals__grand"><dt>Total</dt><dd data-testid="editor-total">{totals.total}</dd></div>
      </dl>
    </fieldset>
  )
}
