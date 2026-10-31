// SQL queries for subscriptions tables; private to the module. Dates are selected as text (YYYY-MM-DD).
import type { Queryable } from '../../lib/db.js'

export interface SubscriptionRow {
  id: string
  number: string
  customer_id: string
  customer_name: string
  customer_email: string
  plan_id: string
  plan_name: string
  billing_frequency: string
  template_id: string | null
  payment_term_id: number
  payment_term_name: string
  status: string
  start_date: string
  expiry_date: string
  quotation_valid_until: string | null
  auto_renew: boolean
  next_billing_date: string | null
  paused_at: Date | null
  confirmed_at: Date | null
  closed_at: Date | null
  closed_reason: string | null
  created_by: string | null
  created_at: Date
  updated_at: Date
}

export interface ItemRow {
  id: string
  product_id: string
  variant_id: string | null
  description: string
  quantity: number
  unit_price: string
  tax_rule_id: string | null
  tax_name: string | null
  tax_rate: string | null
  line_amount: string
  sort_order: number
}

export interface ListRow extends SubscriptionRow { subtotal: string; tax: string }

const HEADER = `s.id, s.number, s.customer_id, c.name AS customer_name, c.email::text AS customer_email,
  s.plan_id, p.name AS plan_name, p.billing_frequency, s.template_id, s.payment_term_id, pt.name AS payment_term_name,
  s.status, s.start_date::text, s.expiry_date::text, s.quotation_valid_until::text, s.auto_renew,
  s.next_billing_date::text, s.paused_at, s.confirmed_at, s.closed_at, s.closed_reason, s.created_by, s.created_at, s.updated_at`
const FROM = `FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
  JOIN payment_terms pt ON pt.id = s.payment_term_id`

export async function findSubscription(db: Queryable, id: number, opts: { forUpdate?: boolean } = {}): Promise<SubscriptionRow | null> {
  const r = await db.query<SubscriptionRow>(`SELECT ${HEADER} ${FROM} WHERE s.id = $1 ${opts.forUpdate ? 'FOR UPDATE OF s' : ''}`, [id])
  return r.rows[0] ?? null
}

export async function listItems(db: Queryable, subscriptionId: number): Promise<ItemRow[]> {
  const r = await db.query<ItemRow>(
    `SELECT i.id, i.product_id, i.variant_id, i.description, i.quantity, i.unit_price, i.tax_rule_id,
            t.name AS tax_name, t.rate::text AS tax_rate, i.line_amount, i.sort_order
       FROM subscription_items i LEFT JOIN tax_rules t ON t.id = i.tax_rule_id
      WHERE i.subscription_id = $1 ORDER BY i.sort_order, i.id`, [subscriptionId])
  return r.rows
}

export interface ListFilters {
  statuses?: readonly string[]
  customer_id?: number
  plan_id?: number
  paused?: boolean
  billing_frequency?: string
  expiry_from?: string
  expiry_to?: string
  next_billing_to?: string
  valid_until_to?: string
  q?: string
}

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`

const SORT: Record<string, string> = {
  number: 's.number', start_date: 's.start_date', expiry_date: 's.expiry_date', next_billing_date: 's.next_billing_date',
  created_at: 's.id', quotation_valid_until: 's.quotation_valid_until',
}

export async function listSubscriptions(db: Queryable, f: ListFilters, o: { sort?: string; defaultSort: string; limit: number; offset: number }) {
  const params: unknown[] = []
  const where: string[] = []
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)) }
  if (f.statuses?.length) add('s.status = ANY(?::text[])', [...f.statuses])
  if (f.customer_id) add('s.customer_id = ?', f.customer_id)
  if (f.plan_id) add('s.plan_id = ?', f.plan_id)
  if (f.paused !== undefined) where.push(f.paused ? 's.paused_at IS NOT NULL' : 's.paused_at IS NULL')
  if (f.billing_frequency) add('p.billing_frequency = ?', f.billing_frequency)
  if (f.expiry_from) add('s.expiry_date >= ?::date', f.expiry_from)
  if (f.expiry_to) add('s.expiry_date <= ?::date', f.expiry_to)
  if (f.next_billing_to) add('s.next_billing_date <= ?::date', f.next_billing_to)
  if (f.valid_until_to) add('s.quotation_valid_until <= ?::date', f.valid_until_to)
  if (f.q) {
    params.push(likePattern(f.q))
    where.push(`(s.number ILIKE $${params.length} OR c.name ILIKE $${params.length})`)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const count = await db.query<{ n: string }>(`SELECT count(*)::text AS n ${FROM} ${w}`, params)
  const order = (o.sort ?? o.defaultSort).split(',').map((x) => `${SORT[x.replace(/^-/, '')]} ${x.startsWith('-') ? 'DESC' : 'ASC'} ${x.startsWith('-') ? 'NULLS LAST' : 'NULLS LAST'}`).join(', ')
  const rows = await db.query<ListRow>(
    `SELECT ${HEADER}, t.subtotal::text AS subtotal, t.tax::text AS tax ${FROM}
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(i.line_amount), 0) AS subtotal,
                COALESCE(sum(round(i.line_amount * COALESCE(tr.rate, 0) / 100, 2)), 0) AS tax
           FROM subscription_items i LEFT JOIN tax_rules tr ON tr.id = i.tax_rule_id WHERE i.subscription_id = s.id) t ON true
       ${w} ORDER BY ${order}, s.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, o.limit, o.offset])
  return { rows: rows.rows, total: Number(count.rows[0]!.n) }
}

// ── reference lookups (read-only; other features own these tables) ──

export async function findCustomer(db: Queryable, id: number) {
  const r = await db.query<{ id: string; is_active: boolean }>('SELECT id, is_active FROM customers WHERE id = $1', [id])
  return r.rows[0] ?? null
}

export async function findPlan(db: Queryable, id: number) {
  const r = await db.query<{ id: string; is_active: boolean; available_from: string; available_to: string | null; min_quantity: number }>(
    'SELECT id, is_active, available_from::text, available_to::text, min_quantity FROM plans WHERE id = $1 FOR SHARE', [id])
  return r.rows[0] ?? null
}

export async function findPaymentTerm(db: Queryable, id: number) {
  const r = await db.query<{ id: number; is_active: boolean }>('SELECT id, is_active FROM payment_terms WHERE id = $1', [id])
  return r.rows[0] ?? null
}

export async function findProducts(db: Queryable, ids: number[]) {
  const r = await db.query<{ id: string; name: string; sales_price: string; is_active: boolean }>(
    'SELECT id, name, sales_price, is_active FROM products WHERE id = ANY($1::bigint[])', [ids])
  return new Map(r.rows.map((x) => [Number(x.id), x]))
}

export async function findVariants(db: Queryable, ids: number[]) {
  const r = await db.query<{ id: string; product_id: string; attribute_name: string; attribute_value: string; price_adjustment: string; is_active: boolean }>(
    'SELECT id, product_id, attribute_name, attribute_value, price_adjustment, is_active FROM product_variants WHERE id = ANY($1::bigint[])', [ids])
  return new Map(r.rows.map((x) => [Number(x.id), x]))
}

export async function findTaxRules(db: Queryable, ids: number[]) {
  const r = await db.query<{ id: string; rate: string; is_active: boolean }>('SELECT id, rate::text, is_active FROM tax_rules WHERE id = ANY($1::bigint[])', [ids])
  return new Map(r.rows.map((x) => [Number(x.id), x]))
}

// ── writes ──

export async function insertSubscription(tx: Queryable, s: {
  customer_id: number; plan_id: number; template_id: number | null; payment_term_id: number
  start_date: string; expiry_date: string; created_by: number
}): Promise<number> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO subscriptions (customer_id, plan_id, template_id, payment_term_id, start_date, expiry_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [s.customer_id, s.plan_id, s.template_id, s.payment_term_id, s.start_date, s.expiry_date, s.created_by])
  return Number(r.rows[0]!.id)
}

export async function updateHeader(tx: Queryable, id: number, s: {
  customer_id: number; plan_id: number; template_id: number | null; payment_term_id: number; start_date: string; expiry_date: string
}): Promise<void> {
  await tx.query(
    `UPDATE subscriptions SET customer_id=$2, plan_id=$3, template_id=$4, payment_term_id=$5, start_date=$6, expiry_date=$7, updated_at=now()
      WHERE id = $1 AND status IN ('draft','quotation')`,
    [id, s.customer_id, s.plan_id, s.template_id, s.payment_term_id, s.start_date, s.expiry_date])
}

export interface NewItem {
  product_id: number; variant_id: number | null; description: string; quantity: number; unit_price: string
  tax_rule_id: number | null; sort_order: number
}

export async function replaceItems(tx: Queryable, subscriptionId: number, items: NewItem[]): Promise<void> {
  await tx.query('DELETE FROM subscription_items WHERE subscription_id = $1', [subscriptionId])
  for (const i of items) {
    await tx.query(
      `INSERT INTO subscription_items (subscription_id, product_id, variant_id, description, quantity, unit_price, tax_rule_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [subscriptionId, i.product_id, i.variant_id, i.description, i.quantity, i.unit_price, i.tax_rule_id, i.sort_order])
  }
}

export async function countItems(db: Queryable, subscriptionId: number): Promise<number> {
  return Number((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM subscription_items WHERE subscription_id = $1', [subscriptionId])).rows[0]!.n)
}

/** F11/F12 own invoices; cancellation is only allowed while none exist. Tolerates the table being absent. */
export async function hasLiveInvoices(db: Queryable, subscriptionId: number): Promise<boolean> {
  const t = await db.query<{ p: boolean }>(`SELECT to_regclass('invoices') IS NOT NULL AS p`)
  if (!t.rows[0]!.p) return false
  const r = await db.query(`SELECT 1 FROM invoices WHERE subscription_id = $1 AND status <> 'cancelled' LIMIT 1`, [subscriptionId])
  return (r.rowCount ?? 0) > 0
}

export interface HistoryRow { id: string; action: string; actor_user_id: string | null; actor_name: string | null; old_values: unknown; new_values: unknown; created_at: Date }

export async function listHistory(db: Queryable, subscriptionId: number): Promise<HistoryRow[]> {
  const r = await db.query<HistoryRow>(
    `SELECT a.id, a.action, a.actor_user_id, u.full_name AS actor_name, a.old_values, a.new_values, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.entity_type = 'subscription' AND a.entity_id = $1 ORDER BY a.id`, [subscriptionId])
  return r.rows
}
