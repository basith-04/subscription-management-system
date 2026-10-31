// Test-only catalogue factories for F09 (products, variants, tax rules, plans, templates). In production these are
// owned by F05/F06/F07/F08; tests create rows directly in the real tables.
import type { Pool } from 'pg'

export const one = async <T extends { id: string }>(r: Promise<{ rows: T[] }>): Promise<number> => Number((await r).rows[0]!.id)

export const createProduct = (pool: Pool, o: { name?: string; sales_price?: string; is_active?: boolean } = {}) =>
  one(pool.query<{ id: string }>(
    `INSERT INTO products (name, product_type, sales_price, is_active) VALUES ($1,'software',$2,$3) RETURNING id`,
    [o.name ?? `Product ${Math.random().toString(36).slice(2, 8)}`, o.sales_price ?? '1000.00', o.is_active ?? true]))

export const createVariant = (pool: Pool, productId: number, o: { attribute_name?: string; attribute_value?: string; price_adjustment?: string; is_active?: boolean } = {}) =>
  one(pool.query<{ id: string }>(
    `INSERT INTO product_variants (product_id, attribute_name, attribute_value, price_adjustment, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [productId, o.attribute_name ?? 'Brand', o.attribute_value ?? `V${Math.random().toString(36).slice(2, 6)}`, o.price_adjustment ?? '560.00', o.is_active ?? true]))

export const createTaxRule = (pool: Pool, o: { name?: string; rate?: string; is_active?: boolean } = {}) =>
  one(pool.query<{ id: string }>('INSERT INTO tax_rules (name, rate, is_active) VALUES ($1,$2,$3) RETURNING id',
    [o.name ?? `Test Tax ${Math.random().toString(36).slice(2, 8)}`, o.rate ?? '18.000', o.is_active ?? true]))

export const createPlan = (pool: Pool, o: { name?: string; min_quantity?: number; available_from?: string; available_to?: string | null; is_active?: boolean } = {}) =>
  one(pool.query<{ id: string }>(
    `INSERT INTO plans (name, price, billing_frequency, min_quantity, available_from, available_to, is_active)
     VALUES ($1,'0.00','monthly',$2,$3,$4,$5) RETURNING id`,
    [o.name ?? `Plan ${Math.random().toString(36).slice(2, 8)}`, o.min_quantity ?? 1, o.available_from ?? '2020-01-01', o.available_to ?? null, o.is_active ?? true]))

export const firstPaymentTerm = async (pool: Pool) => Number((await pool.query<{ id: number }>('SELECT id FROM payment_terms WHERE is_active ORDER BY id LIMIT 1')).rows[0]!.id)

export const createTemplate = async (pool: Pool, o: {
  planId: number; validity_days?: number; paymentTermId?: number | null; is_active?: boolean
  items: Array<{ product_id: number; variant_id?: number | null; quantity: number; unit_price_override?: string | null; tax_rule_id?: number | null }>
}) => {
  const id = await one(pool.query<{ id: string }>(
    'INSERT INTO quotation_templates (name, plan_id, validity_days, payment_term_id, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [`Template ${Math.random().toString(36).slice(2, 8)}`, o.planId, o.validity_days ?? 14, o.paymentTermId === undefined ? await firstPaymentTerm(pool) : o.paymentTermId, o.is_active ?? true]))
  let order = 0
  for (const i of o.items) {
    await pool.query(
      `INSERT INTO quotation_template_items (template_id, product_id, variant_id, quantity, unit_price_override, tax_rule_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, i.product_id, i.variant_id ?? null, i.quantity, i.unit_price_override ?? null, i.tax_rule_id ?? null, order++])
  }
  return id
}
