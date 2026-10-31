import type { Queryable } from '../../lib/db.js'
import type { CreateTemplateInput, ListTemplateQuery, TemplateItemInput, UpdateTemplateInput } from './quotation-templates.schemas.js'

export interface TemplateRow {
  id: number; name: string; plan_id: number; plan_name: string; plan_is_active: boolean; plan_min_quantity: number
  plan_available_from: string; plan_available_to: string | null; plan_billing_frequency: string; plan_price: string
  validity_days: number; payment_term_id: number | null; payment_term_name: string | null; payment_term_is_active: boolean | null; payment_term_due_days: number | null
  notes: string | null; is_active: boolean; created_at: Date; updated_at: Date
}
export interface TemplateItemRow {
  id: number; product_id: number; product_name: string; product_is_active: boolean; sales_price: string
  variant_id: number | null; variant_product_id: number | null; variant_label: string | null
  variant_is_active: boolean | null; price_adjustment: string | null; quantity: number
  unit_price_override: string | null; tax_rule_id: number | null; tax_rule_name: string | null
  tax_rule_is_active: boolean | null; sort_order: number
}

export async function list(db: Queryable, input: ListTemplateQuery, limit: number, offset: number) {
  const params: unknown[] = []
  const where: string[] = []
  if (input.q) { params.push(`%${input.q.replace(/[\\%_]/g, '\\$&')}%`); where.push(`t.name ILIKE $${params.length}`) }
  if (input.is_active !== undefined) { params.push(input.is_active); where.push(`t.is_active = $${params.length}`) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sort = { name: 't.name ASC', '-name': 't.name DESC', created_at: 't.created_at ASC', '-created_at': 't.created_at DESC' }[input.sort ?? 'name']
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM quotation_templates t ${clause}`, params)
  const rows = await db.query(`SELECT t.id::int, t.name, t.plan_id::int, p.name AS plan_name, t.validity_days,
    t.payment_term_id::int, t.is_active, t.created_at, t.updated_at
    FROM quotation_templates t JOIN plans p ON p.id=t.plan_id ${clause}
    ORDER BY ${sort}, t.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset])
  return { rows: rows.rows, total: count.rows[0]?.total ?? 0 }
}

export async function find(db: Queryable, id: number, lock = false) {
  const row = await db.query<TemplateRow>(`SELECT t.id::int, t.name, t.plan_id::int, p.name AS plan_name, p.is_active AS plan_is_active,
    p.min_quantity AS plan_min_quantity, to_char(p.available_from, 'YYYY-MM-DD') AS plan_available_from,
    to_char(p.available_to, 'YYYY-MM-DD') AS plan_available_to, p.billing_frequency AS plan_billing_frequency, p.price::text AS plan_price,
    t.validity_days, t.payment_term_id::int, pt.name AS payment_term_name,
    pt.is_active AS payment_term_is_active, pt.due_days AS payment_term_due_days, t.notes, t.is_active, t.created_at, t.updated_at
    FROM quotation_templates t JOIN plans p ON p.id=t.plan_id LEFT JOIN payment_terms pt ON pt.id=t.payment_term_id
    WHERE t.id=$1${lock ? ' FOR UPDATE OF t' : ''}`, [id])
  return row.rows[0] ?? null
}

export async function items(db: Queryable, id: number) {
  const result = await db.query<TemplateItemRow>(`SELECT i.id::int, i.product_id::int, p.name AS product_name, p.is_active AS product_is_active,
    p.sales_price::text, i.variant_id::int, v.product_id::int AS variant_product_id,
    CASE WHEN v.id IS NULL THEN NULL ELSE v.attribute_name || ': ' || v.attribute_value END AS variant_label,
    v.is_active AS variant_is_active, v.price_adjustment::text, i.quantity, i.unit_price_override::text,
    i.tax_rule_id::int, tax.name AS tax_rule_name, tax.is_active AS tax_rule_is_active, i.sort_order
    FROM quotation_template_items i JOIN products p ON p.id=i.product_id
    LEFT JOIN product_variants v ON v.id=i.variant_id LEFT JOIN tax_rules tax ON tax.id=i.tax_rule_id
    WHERE i.template_id=$1 ORDER BY i.sort_order, i.id`, [id])
  return result.rows
}

export async function validateReferences(db: Queryable, planId: number | undefined, termId: number | null | undefined, rows: TemplateItemInput[] | undefined) {
  const errors: { field: string; message: string }[] = []
  if (planId !== undefined) {
    const r = await db.query('SELECT is_active FROM plans WHERE id=$1 FOR SHARE', [planId])
    if (!r.rows[0]?.is_active) errors.push({ field: 'plan_id', message: 'Plan must exist and be active' })
  }
  if (termId != null) {
    const r = await db.query('SELECT is_active FROM payment_terms WHERE id=$1 FOR SHARE', [termId])
    if (!r.rows[0]?.is_active) errors.push({ field: 'payment_term_id', message: 'Payment term must exist and be active' })
  }
  if (rows?.length) {
    const products = await db.query('SELECT id::int, is_active FROM products WHERE id=ANY($1::bigint[]) FOR SHARE', [rows.map((r) => r.product_id)])
    const variants = await db.query('SELECT id::int, product_id::int, is_active FROM product_variants WHERE id=ANY($1::bigint[]) FOR SHARE', [rows.flatMap((r) => r.variant_id ? [r.variant_id] : [])])
    const taxes = await db.query('SELECT id::int, is_active FROM tax_rules WHERE id=ANY($1::bigint[]) FOR SHARE', [rows.flatMap((r) => r.tax_rule_id ? [r.tax_rule_id] : [])])
    rows.forEach((r, i) => {
      const product = products.rows.find((p) => p.id === r.product_id)
      if (!product?.is_active) errors.push({ field: `items.${i}.product_id`, message: 'Product must exist and be active' })
      if (r.variant_id) {
        const variant = variants.rows.find((v) => v.id === r.variant_id)
        if (!variant?.is_active || variant.product_id !== r.product_id) errors.push({ field: `items.${i}.variant_id`, message: 'Variant must be active and belong to the product' })
      }
      if (r.tax_rule_id && !taxes.rows.find((t) => t.id === r.tax_rule_id)?.is_active) errors.push({ field: `items.${i}.tax_rule_id`, message: 'Tax rule must exist and be active' })
    })
  }
  return errors
}

export async function insert(db: Queryable, input: CreateTemplateInput): Promise<number> {
  const r = await db.query<{ id: number }>(`INSERT INTO quotation_templates (name, plan_id, validity_days, payment_term_id, notes, is_active)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::int`, [input.name, input.plan_id, input.validity_days, input.payment_term_id ?? null, input.notes ?? null, input.is_active ?? true])
  return r.rows[0]!.id
}

export async function update(db: Queryable, id: number, input: UpdateTemplateInput) {
  const allowed = ['name', 'plan_id', 'validity_days', 'payment_term_id', 'notes', 'is_active'] as const
  const params: unknown[] = []
  const sets: string[] = []
  for (const key of allowed) if (input[key] !== undefined) { params.push(input[key]); sets.push(`${key}=$${params.length}`) }
  params.push(id)
  await db.query(`UPDATE quotation_templates SET ${sets.length ? `${sets.join(', ')}, ` : ''}updated_at=now() WHERE id=$${params.length}`, params)
}

export async function replaceItems(db: Queryable, id: number, rows: TemplateItemInput[]) {
  await db.query('DELETE FROM quotation_template_items WHERE template_id=$1', [id])
  for (const [sort, row] of rows.entries()) await db.query(`INSERT INTO quotation_template_items
    (template_id, product_id, variant_id, quantity, unit_price_override, tax_rule_id, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, row.product_id, row.variant_id ?? null, row.quantity, row.unit_price_override ?? null, row.tax_rule_id ?? null, sort])
}
