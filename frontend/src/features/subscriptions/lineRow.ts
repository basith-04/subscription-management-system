export interface LineRow {
  key: string
  product_id: number | null
  variant_id: number | null
  quantity: string
  unit_price: string
  tax_rule_id: number | null
  /** True once the user typed a price; catalogue prices stop auto-filling. */
  priceEdited: boolean
  salesPrice?: string
  adjustment?: string | null
}

let counter = 0
export const newRow = (over: Partial<LineRow> = {}): LineRow => ({
  key: `row-${++counter}`, product_id: null, variant_id: null, quantity: '1', unit_price: '', tax_rule_id: null, priceEdited: false, ...over,
})

