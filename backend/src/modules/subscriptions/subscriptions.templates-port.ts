// F08 integration port. F08 (quotation templates) owns `quotation_templates` / `quotation_template_items`
// and will export `getTemplateForUse(id)`. Until its migration and module land on main, F09 reads the documented
// tables through this single adapter (docs/database/database-design.md §4.4); when F08 ships, replace the body
// with a call to its public function. If the tables do not exist the port reports "unavailable" — F09 never
// creates or owns template tables.
import type { Queryable } from '../../lib/db.js'

export interface TemplateForUse {
  id: number
  plan_id: number
  validity_days: number
  payment_term_id: number | null
  items: Array<{ product_id: number; variant_id: number | null; quantity: number; unit_price_override: string | null; tax_rule_id: number | null }>
}

export type TemplateLookup = { status: 'unavailable' } | { status: 'missing' } | { status: 'inactive' } | { status: 'ok'; template: TemplateForUse }

export async function getTemplateForUse(db: Queryable, id: number): Promise<TemplateLookup> {
  const exists = await db.query<{ p: boolean }>(`SELECT to_regclass('quotation_templates') IS NOT NULL AS p`)
  if (!exists.rows[0]!.p) return { status: 'unavailable' }
  const t = await db.query<{ id: string; plan_id: string; validity_days: number; payment_term_id: number | null; is_active: boolean }>(
    'SELECT id, plan_id, validity_days, payment_term_id, is_active FROM quotation_templates WHERE id = $1', [id])
  const row = t.rows[0]
  if (!row) return { status: 'missing' }
  if (!row.is_active) return { status: 'inactive' }
  const items = await db.query<{ product_id: string; variant_id: string | null; quantity: number; unit_price_override: string | null; tax_rule_id: string | null }>(
    `SELECT product_id, variant_id, quantity, unit_price_override, tax_rule_id
       FROM quotation_template_items WHERE template_id = $1 ORDER BY sort_order, id`, [id])
  return {
    status: 'ok',
    template: {
      id: Number(row.id), plan_id: Number(row.plan_id), validity_days: row.validity_days, payment_term_id: row.payment_term_id,
      items: items.rows.map((i) => ({
        product_id: Number(i.product_id), variant_id: i.variant_id === null ? null : Number(i.variant_id),
        quantity: i.quantity, unit_price_override: i.unit_price_override, tax_rule_id: i.tax_rule_id === null ? null : Number(i.tax_rule_id),
      })),
    },
  }
}

/** Validity days of the template a quotation was created from, for the issue default. Null when unknown. */
export async function getTemplateValidityDays(db: Queryable, id: number): Promise<number | null> {
  const exists = await db.query<{ p: boolean }>(`SELECT to_regclass('quotation_templates') IS NOT NULL AS p`)
  if (!exists.rows[0]!.p) return null
  const r = await db.query<{ validity_days: number }>('SELECT validity_days FROM quotation_templates WHERE id = $1', [id])
  return r.rows[0]?.validity_days ?? null
}
