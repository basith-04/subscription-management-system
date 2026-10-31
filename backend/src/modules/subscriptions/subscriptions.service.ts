// Business rules and transactions for quotations and subscriptions (F09).
// A quotation is a subscription in draft/quotation status; /quotations and /subscriptions share this service.
// F09 owns create, update, issue, confirm, cancel, list, get and history. Activation, pause, renew and close are
// F10; invoices are F11/F12; payments are F13; discounts are F15 — none of those are implemented here.
import type { Pool } from 'pg'
import { computeLine, computeTotals, resolveUnitPrice, type PriceTotals } from '../../billing/calculators/pricing.js'
import { todayInAppTimezone } from '../../lib/dates.js'
import { withTransaction, type Queryable } from '../../lib/db.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { add } from '../../lib/money.js'
import { ApiError, type FieldError } from '../../lib/errors.js'
import { buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import { transition } from '../../lib/state-machine.js'
import { writeAudit } from '../../lib/audit.js'
import { assertPlanAndQuantities, assertCreationStartDate } from './subscriptions.validation.js'
import { assertQuotationValidity, getF09Transition } from './subscriptions.state-machine.js'
import { CANCELLED_REASON, QUOTATION_STATUSES, SUBSCRIPTION_AUDIT, SUBSCRIPTION_ENTITY } from './subscriptions.constants.js'
import * as repo from './subscriptions.repository.js'
import type {
  CreateSubscriptionInput, SubscriptionItemInput, UpdateSubscriptionInput,
} from './subscriptions.schemas.js'
import { getTemplateForUse, getTemplateValidityDays, type TemplateForUse } from './subscriptions.templates-port.js'

export interface Actor { id: number; role: string; customerId: number | null; ip: string | null }

export interface LineDto {
  id: number
  product_id: number
  variant_id: number | null
  description: string
  quantity: number
  unit_price: string
  tax_rule: { id: number; name: string; rate: string } | null
  line_amount: string
  tax_amount: string
  line_total: string
  sort_order: number
}

export interface SubscriptionDto {
  id: number
  number: string
  status: string
  display_status: string
  customer: { id: number; name: string; email: string }
  plan: { id: number; name: string; billing_frequency: string }
  template_id: number | null
  payment_term: { id: number; name: string }
  start_date: string
  expiry_date: string
  days_to_expiry: number
  quotation_valid_until: string | null
  next_billing_date: string | null
  auto_renew: boolean
  confirmed_at: string | null
  closed_at: string | null
  closed_reason: string | null
  items: LineDto[]
  /** Estimates before discounts; invoices are authoritative (F11/F12). */
  totals: PriceTotals
  can_edit: boolean
  can_issue: boolean
  can_confirm: boolean
  can_cancel: boolean
  created_at: string
  updated_at: string
}

export interface ListItemDto {
  id: number
  number: string
  customer: { id: number; name: string }
  plan: { id: number; name: string }
  status: string
  display_status: string
  start_date: string
  expiry_date: string
  quotation_valid_until: string | null
  next_billing_date: string | null
  total_per_period: string
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const num = (v: string | number) => Number(v)
const validation = (details: FieldError[]) => new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', details)
const notFound = () => new ApiError(404, ERROR_CODES.NOT_FOUND, 'Subscription not found')
const businessToday = (now: Date) => todayInAppTimezone(now)

/** Domain RangeErrors (money limits, invalid dates) are user input problems → 422, never a raw 500. */
function guarded<T>(field: string, fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof RangeError) throw validation([{ field, message: error.message }])
    throw error
  }
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

function displayStatus(row: { status: string; paused_at: Date | null; quotation_valid_until: string | null }, today: string): string {
  if (row.status === 'active' && row.paused_at) return 'Active (Paused)'
  if (row.status === 'quotation' && row.quotation_valid_until && row.quotation_valid_until < today) return 'Quotation (expired)'
  return row.status.charAt(0).toUpperCase() + row.status.slice(1)
}

function toLines(items: repo.ItemRow[]): LineDto[] {
  return items.map((i) => {
    const line = computeLine({ quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate })
    return {
      id: num(i.id), product_id: num(i.product_id), variant_id: i.variant_id === null ? null : num(i.variant_id),
      description: i.description, quantity: i.quantity, unit_price: i.unit_price,
      tax_rule: i.tax_rule_id === null ? null : { id: num(i.tax_rule_id), name: i.tax_name ?? '', rate: i.tax_rate ?? '0.000' },
      line_amount: line.line_amount, tax_amount: line.tax_amount, line_total: line.line_total, sort_order: i.sort_order,
    }
  })
}

function toDto(row: repo.SubscriptionRow, items: repo.ItemRow[], today: string): SubscriptionDto {
  const editable = (QUOTATION_STATUSES as readonly string[]).includes(row.status)
  const expired = row.status === 'quotation' && (!row.quotation_valid_until || row.quotation_valid_until < today)
  return {
    id: num(row.id), number: row.number, status: row.status, display_status: displayStatus(row, today),
    customer: { id: num(row.customer_id), name: row.customer_name, email: row.customer_email },
    plan: { id: num(row.plan_id), name: row.plan_name, billing_frequency: row.billing_frequency },
    template_id: row.template_id === null ? null : num(row.template_id),
    payment_term: { id: row.payment_term_id, name: row.payment_term_name },
    start_date: row.start_date, expiry_date: row.expiry_date, days_to_expiry: daysBetween(today, row.expiry_date),
    quotation_valid_until: row.quotation_valid_until, next_billing_date: row.next_billing_date, auto_renew: row.auto_renew,
    confirmed_at: iso(row.confirmed_at), closed_at: iso(row.closed_at), closed_reason: row.closed_reason,
    items: toLines(items),
    totals: computeTotals(items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate }))),
    can_edit: editable, can_issue: row.status === 'draft', can_confirm: row.status === 'quotation' && !expired,
    can_cancel: ['draft', 'quotation', 'confirmed'].includes(row.status),
    created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
  }
}

async function loadDetail(db: Queryable, id: number, today: string): Promise<SubscriptionDto> {
  const row = await repo.findSubscription(db, id)
  if (!row) throw notFound()
  return toDto(row, await repo.listItems(db, id), today)
}

// ── line building (snapshots) ──

type RawItem = SubscriptionItemInput & { template_override?: string | null }

/**
 * Validate catalogue references and snapshot description + unit price for each line.
 * The price comes from F06's effective-price helper through resolveUnitPrice: explicit line price, else the
 * template override, else product price + variant adjustment. The result is stored and never recomputed.
 */
async function buildItems(tx: Queryable, items: RawItem[]): Promise<repo.NewItem[]> {
  const products = await repo.findProducts(tx, [...new Set(items.map((i) => i.product_id))])
  const variantIds = [...new Set(items.flatMap((i) => (i.variant_id ? [i.variant_id] : [])))]
  const variants = variantIds.length ? await repo.findVariants(tx, variantIds) : new Map()
  const taxIds = [...new Set(items.flatMap((i) => (i.tax_rule_id ? [i.tax_rule_id] : [])))]
  const taxes = taxIds.length ? await repo.findTaxRules(tx, taxIds) : new Map()

  const errors: FieldError[] = []
  const built: repo.NewItem[] = []
  items.forEach((item, index) => {
    const product = products.get(item.product_id)
    if (!product || !product.is_active) {
      return void errors.push({ field: `items.${index}.product_id`, message: product ? 'Product is not active' : 'Product not found' })
    }
    const variant = item.variant_id ? variants.get(item.variant_id) : undefined
    if (item.variant_id && (!variant || Number(variant.product_id) !== item.product_id || !variant.is_active)) {
      return void errors.push({ field: `items.${index}.variant_id`, message: 'Variant not found, inactive, or not a variant of this product' })
    }
    if (item.tax_rule_id) {
      const tax = taxes.get(item.tax_rule_id)
      if (!tax || !tax.is_active) return void errors.push({ field: `items.${index}.tax_rule_id`, message: tax ? 'Tax rule is not active' : 'Tax rule not found' })
    }
    const unit_price = guarded(`items.${index}.unit_price`, () => resolveUnitPrice({
      product: { sales_price: product.sales_price },
      ...(variant ? { variant: { price_adjustment: variant.price_adjustment } } : {}),
      lineOverride: item.unit_price ?? null, templateOverride: item.template_override ?? null,
    }))
    built.push({
      product_id: item.product_id, variant_id: item.variant_id ?? null,
      description: variant ? `${product.name} – ${variant.attribute_name}: ${variant.attribute_value}` : product.name,
      quantity: item.quantity, unit_price, tax_rule_id: item.tax_rule_id ?? null, sort_order: index,
    })
  })
  if (errors.length) throw validation(errors)
  // Overflow of the NUMERIC(12,2) columns is a client error, not a 500.
  guarded('items', () => computeTotals(built.map((b) => ({ quantity: b.quantity, unit_price: b.unit_price,
    tax_rate: b.tax_rule_id ? (taxes.get(b.tax_rule_id)?.rate ?? '0') : '0' }))))
  return built
}

async function requireTemplate(tx: Queryable, templateId: number): Promise<TemplateForUse> {
  const found = await getTemplateForUse(tx, templateId)
  if (found.status === 'ok') return found.template
  const message = { unavailable: 'Quotation templates are not available yet', missing: 'Template not found', inactive: 'Template is not active' }[found.status]
  throw validation([{ field: 'template_id', message }])
}

async function requireCustomer(tx: Queryable, customerId: number) {
  const c = await repo.findCustomer(tx, customerId)
  if (!c || !c.is_active) throw validation([{ field: 'customer_id', message: c ? 'Customer is not active' : 'Customer not found' }])
}

async function requirePaymentTerm(tx: Queryable, termId: number | undefined) {
  if (termId === undefined) throw validation([{ field: 'payment_term_id', message: 'Select a payment term (or use a template that defines one)' }])
  const t = await repo.findPaymentTerm(tx, termId)
  if (!t || !t.is_active) throw validation([{ field: 'payment_term_id', message: t ? 'Payment term is not active' : 'Payment term not found' }])
}

async function requirePlan(tx: Queryable, planId: number) {
  const plan = await repo.findPlan(tx, planId)
  if (!plan) throw validation([{ field: 'plan_id', message: 'Plan not found' }])
  return plan
}

// ── create ──

export async function create(pool: Pool, input: CreateSubscriptionInput, actor: Actor, now: Date = new Date()): Promise<SubscriptionDto> {
  const today = businessToday(now)
  return withTransaction(pool, async (tx) => {
    guarded('start_date', () => assertCreationStartDate(actor.role, input.start_date, today))
    await requireCustomer(tx, input.customer_id)

    const template = input.template_id ? await requireTemplate(tx, input.template_id) : null
    if (template && input.plan_id && input.plan_id !== template.plan_id) {
      throw validation([{ field: 'plan_id', message: "The selected plan does not match the template's plan" }])
    }
    const planId = input.plan_id ?? template!.plan_id
    const plan = await requirePlan(tx, planId)

    const rawItems: RawItem[] = input.items ?? (template?.items.map((t) => ({
      product_id: t.product_id, variant_id: t.variant_id, quantity: t.quantity, tax_rule_id: t.tax_rule_id, template_override: t.unit_price_override,
    })) ?? [])
    guarded('items', () => assertPlanAndQuantities(plan, input.start_date, rawItems))
    await requirePaymentTerm(tx, input.payment_term_id ?? template?.payment_term_id ?? undefined)
    const items = await buildItems(tx, rawItems)

    const id = await repo.insertSubscription(tx, {
      customer_id: input.customer_id, plan_id: planId, template_id: template?.id ?? null,
      payment_term_id: (input.payment_term_id ?? template?.payment_term_id) as number,
      start_date: input.start_date, expiry_date: input.expiry_date, created_by: actor.id,
    })
    await repo.replaceItems(tx, id, items)
    await writeAudit(tx, {
      actorUserId: actor.id, action: SUBSCRIPTION_AUDIT.create, entityType: SUBSCRIPTION_ENTITY, entityId: id,
      newValues: { status: 'draft', customer_id: input.customer_id, plan_id: planId, template_id: template?.id ?? null, lines: items.length }, ipAddress: actor.ip,
    })
    return loadDetail(tx, id, today)
  })
}

// ── update (draft / quotation only) ──

export async function update(pool: Pool, id: number, input: UpdateSubscriptionInput, actor: Actor, now: Date = new Date()): Promise<SubscriptionDto> {
  const today = businessToday(now)
  return withTransaction(pool, async (tx) => {
    const row = await repo.findSubscription(tx, id, { forUpdate: true })
    if (!row) throw notFound()
    if (!(QUOTATION_STATUSES as readonly string[]).includes(row.status)) {
      throw new ApiError(409, ERROR_CODES.INVALID_STATE_TRANSITION, `A ${row.status} subscription can no longer be edited here`)
    }
    const merged = {
      customer_id: input.customer_id ?? num(row.customer_id),
      plan_id: input.plan_id ?? num(row.plan_id),
      template_id: input.template_id !== undefined ? input.template_id : row.template_id === null ? null : num(row.template_id),
      payment_term_id: input.payment_term_id ?? row.payment_term_id,
      start_date: input.start_date ?? row.start_date,
      expiry_date: input.expiry_date ?? row.expiry_date,
    }
    if (merged.expiry_date < merged.start_date) throw validation([{ field: 'expiry_date', message: 'Expiry must be on or after the start date' }])
    if (input.start_date !== undefined) guarded('start_date', () => assertCreationStartDate(actor.role, merged.start_date, today))
    if (input.customer_id !== undefined) await requireCustomer(tx, merged.customer_id)
    if (input.template_id) {
      const template = await requireTemplate(tx, input.template_id)
      if (template.plan_id !== merged.plan_id) throw validation([{ field: 'template_id', message: "The template's plan does not match the subscription plan" }])
    }
    if (input.payment_term_id !== undefined) await requirePaymentTerm(tx, merged.payment_term_id)

    const plan = await requirePlan(tx, merged.plan_id)
    const existing = input.items ? null : await repo.listItems(tx, id)
    const quantities = input.items ?? existing!.map((i) => ({ quantity: i.quantity }))
    guarded('items', () => assertPlanAndQuantities(plan, merged.start_date, quantities))
    const items = input.items ? await buildItems(tx, input.items) : null

    await repo.updateHeader(tx, id, { ...merged, template_id: merged.template_id ?? null })
    if (items) await repo.replaceItems(tx, id, items)

    const changed: Record<string, unknown> = {}
    const before: Record<string, unknown> = {}
    const old = { customer_id: num(row.customer_id), plan_id: num(row.plan_id), template_id: row.template_id === null ? null : num(row.template_id),
      payment_term_id: row.payment_term_id, start_date: row.start_date, expiry_date: row.expiry_date }
    for (const key of Object.keys(old) as (keyof typeof old)[]) {
      const next = merged[key] ?? null
      if (next !== old[key]) { before[key] = old[key]; changed[key] = next }
    }
    if (items) changed.lines = items.length
    if (Object.keys(changed).length) {
      await writeAudit(tx, { actorUserId: actor.id, action: SUBSCRIPTION_AUDIT.update, entityType: SUBSCRIPTION_ENTITY, entityId: id,
        oldValues: before, newValues: changed, ipAddress: actor.ip })
    }
    return loadDetail(tx, id, today)
  })
}

// ── issue / confirm / cancel (shared transition helper; one transaction each) ──

export async function issue(pool: Pool, id: number, input: { valid_until?: string }, actor: Actor, now: Date = new Date()): Promise<SubscriptionDto> {
  const today = businessToday(now)
  return withTransaction(pool, async (tx) => {
    const row = await repo.findSubscription(tx, id, { forUpdate: true })
    if (!row) throw notFound()
    const rule = { to: getF09Transition('issue', row.status) }
    if ((await repo.countItems(tx, id)) < 1) throw validation([{ field: 'items', message: 'Add at least one line before issuing the quotation' }])

    let validUntil = input.valid_until
    if (!validUntil && row.template_id !== null) {
      const days = await getTemplateValidityDays(tx, num(row.template_id))
      if (days) validUntil = addDays(today, days)
    }
    if (!validUntil) throw validation([{ field: 'valid_until', message: 'Provide valid_until (this quotation has no template validity to default from)' }])
    if (validUntil < today) throw validation([{ field: 'valid_until', message: 'Validity cannot be in the past' }])

    await transition({ tx, entity: 'subscriptions', id, from: ['draft'], to: rule.to, fields: { quotation_valid_until: validUntil },
      actorUserId: actor.id, action: SUBSCRIPTION_AUDIT.issue, ipAddress: actor.ip })
    return loadDetail(tx, id, today)
  })
}

export async function confirm(pool: Pool, id: number, actor: Actor, now: Date = new Date()): Promise<SubscriptionDto | CustomerConfirmDto> {
  const today = businessToday(now)
  return withTransaction(pool, async (tx) => {
    const row = await repo.findSubscription(tx, id, { forUpdate: true })
    // A customer may only touch their own quotation; anyone else's looks like it does not exist.
    if (!row || (actor.role === 'customer' && (actor.customerId === null || num(row.customer_id) !== actor.customerId))) throw notFound()
    const to = getF09Transition('confirm', row.status)
    assertQuotationValidity(row.quotation_valid_until, today)

    // Re-validate at confirmation: the plan may have been deactivated or its minimum changed since saving.
    const plan = await requirePlan(tx, num(row.plan_id))
    const items = await repo.listItems(tx, id)
    assertPlanAndQuantities(plan, row.start_date, items.map((i) => ({ quantity: i.quantity })))

    await transition({ tx, entity: 'subscriptions', id, from: ['quotation'], to, fields: { confirmed_at: new Date(now) },
      actorUserId: actor.id, action: SUBSCRIPTION_AUDIT.confirm, ipAddress: actor.ip })
    const dto = await loadDetail(tx, id, today)
    return actor.role === 'customer' ? toCustomerConfirm(dto) : dto
  })
}

export interface CustomerConfirmDto { id: number; number: string; status: string; display_status: string; start_date: string; expiry_date: string }
const toCustomerConfirm = (d: SubscriptionDto): CustomerConfirmDto => ({
  id: d.id, number: d.number, status: d.status, display_status: d.display_status, start_date: d.start_date, expiry_date: d.expiry_date,
})

export async function cancel(pool: Pool, id: number, input: { reason?: string }, actor: Actor, now: Date = new Date()): Promise<SubscriptionDto> {
  const today = businessToday(now)
  return withTransaction(pool, async (tx) => {
    const row = await repo.findSubscription(tx, id, { forUpdate: true })
    if (!row) throw notFound()
    const to = getF09Transition('cancel', row.status)
    if (await repo.hasLiveInvoices(tx, id)) {
      throw new ApiError(409, ERROR_CODES.INVALID_STATE_TRANSITION, 'Invoices already exist for this subscription; it cannot be cancelled here')
    }
    await transition({ tx, entity: 'subscriptions', id, from: ['draft', 'quotation', 'confirmed'], to,
      fields: { closed_at: new Date(now), closed_reason: CANCELLED_REASON },
      ...(input.reason ? { reason: input.reason } : {}), actorUserId: actor.id, action: SUBSCRIPTION_AUDIT.cancel, ipAddress: actor.ip })
    return loadDetail(tx, id, today)
  })
}

// ── reads ──

export function get(pool: Pool, id: number, now: Date = new Date()): Promise<SubscriptionDto> {
  return loadDetail(pool, id, businessToday(now))
}

export interface ListQuery {
  status?: string; customer_id?: number; plan_id?: number; paused?: boolean; billing_frequency?: string
  expiry_from?: string; expiry_to?: string; next_billing_to?: string; valid_until_to?: string; q?: string
  sort?: string; page?: number; page_size?: number
}

export async function list(pool: Pool, kind: 'quotations' | 'subscriptions', query: ListQuery, now: Date = new Date()): Promise<{ data: ListItemDto[]; meta: PageMeta }> {
  const today = businessToday(now)
  const page = query.page ?? 1
  const size = query.page_size ?? 20
  const { sort, page: _p, page_size: _s, status, ...filters } = query
  const statuses = kind === 'quotations'
    ? (status ? [status] : [...QUOTATION_STATUSES])
    : status ? [status] : undefined
  const { rows, total } = await repo.listSubscriptions(pool, { ...filters, ...(statuses ? { statuses } : {}) }, {
    ...(sort ? { sort } : {}), defaultSort: '-created_at', limit: size, offset: (page - 1) * size,
  })
  return {
    data: rows.map((r) => ({
      id: num(r.id), number: r.number, customer: { id: num(r.customer_id), name: r.customer_name },
      plan: { id: num(r.plan_id), name: r.plan_name }, status: r.status, display_status: displayStatus(r, today),
      start_date: r.start_date, expiry_date: r.expiry_date, quotation_valid_until: r.quotation_valid_until,
      next_billing_date: r.next_billing_date,
      total_per_period: add(r.subtotal, r.tax),
    })),
    meta: buildMeta(total, page, size),
  }
}

export interface HistoryEntryDto {
  id: number; action: string; actor: { id: number; name: string | null } | null
  old_values: unknown; new_values: unknown; created_at: string
}

export async function getHistory(pool: Pool, id: number): Promise<HistoryEntryDto[]> {
  if (!(await repo.findSubscription(pool, id))) throw notFound()
  return (await repo.listHistory(pool, id)).map((h) => ({
    id: num(h.id), action: h.action, actor: h.actor_user_id === null ? null : { id: num(h.actor_user_id), name: h.actor_name },
    old_values: h.old_values, new_values: h.new_values, created_at: h.created_at.toISOString(),
  }))
}
