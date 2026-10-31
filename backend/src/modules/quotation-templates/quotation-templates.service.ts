import type { Pool } from 'pg'
import { getSharedPool, isPgError, withTransaction, type Queryable } from '../../lib/db.js'
import { writeAudit } from '../../lib/audit.js'
import { buildMeta, parsePagination } from '../../lib/pagination.js'
import { computeEffectivePrice } from '../products/index.js'
import { ApiError } from '../../lib/errors.js'
import * as repo from './quotation-templates.repository.js'
import type { CreateTemplateInput, ListTemplateQuery, TemplateItemInput, UpdateTemplateInput } from './quotation-templates.schemas.js'

function mapWriteError(error: unknown): never {
  if (isPgError(error) && error.code === '23505') throw new ApiError(409, 'CONFLICT', 'A template with this name already exists')
  if (isPgError(error) && (error.code === '23503' || error.code === '23514')) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid reference or value')
  throw error
}

async function requireTemplate(db: Queryable, id: number, lock = false) {
  const template = await repo.find(db, id, lock)
  if (!template) throw new ApiError(404, 'NOT_FOUND', 'Quotation template not found')
  return template
}

async function validateRefs(db: Queryable, plan: number | undefined, term: number | null | undefined, items: TemplateItemInput[] | undefined) {
  const errors = await repo.validateReferences(db, plan, term, items)
  if (errors.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', errors)
}

export async function list(input: ListTemplateQuery, pool: Pool = getSharedPool()) {
  const { page, page_size, limit, offset } = parsePagination(input)
  const result = await repo.list(pool, input, limit, offset)
  return { data: result.rows, meta: buildMeta(result.total, page, page_size) }
}

export async function get(id: number, db: Queryable = getSharedPool()) {
  const template = await requireTemplate(db, id)
  const items = (await repo.items(db, id)).map((item) => ({
    ...item,
    effective_price: computeEffectivePrice({ sales_price: item.sales_price }, item.variant_id && item.price_adjustment !== null ? { price_adjustment: item.price_adjustment } : undefined),
  }))
  return { ...template, items }
}

export async function create(input: CreateTemplateInput, actor: number, pool: Pool = getSharedPool()) {
  try {
    return await withTransaction(pool, async (tx) => {
      await validateRefs(tx, input.plan_id, input.payment_term_id, input.items)
      const id = await repo.insert(tx, input)
      await repo.replaceItems(tx, id, input.items)
      const result = await get(id, tx)
      await writeAudit(tx, { actorUserId: actor, action: 'quotation_template.create', entityType: 'quotation_template', entityId: id, newValues: result })
      return result
    })
  } catch (error) { return mapWriteError(error) }
}

export async function update(id: number, input: UpdateTemplateInput, actor: number, pool: Pool = getSharedPool()) {
  try {
    return await withTransaction(pool, async (tx) => {
      await requireTemplate(tx, id, true)
      const before = await get(id, tx)
      await validateRefs(tx, input.plan_id, input.payment_term_id, input.items)
      await repo.update(tx, id, input)
      if (input.items !== undefined) await repo.replaceItems(tx, id, input.items)
      const after = await get(id, tx)
      await writeAudit(tx, { actorUserId: actor, action: 'quotation_template.update', entityType: 'quotation_template', entityId: id, oldValues: before, newValues: after })
      return after
    })
  } catch (error) { return mapWriteError(error) }
}

/** D-10: DELETE deactivates, preserving all quotation references. */
export async function deactivate(id: number, actor: number, pool: Pool = getSharedPool()) {
  return withTransaction(pool, async (tx) => {
    const before = await requireTemplate(tx, id, true)
    if (before.is_active) {
      await repo.update(tx, id, { is_active: false })
      await writeAudit(tx, { actorUserId: actor, action: 'quotation_template.deactivate', entityType: 'quotation_template', entityId: id, oldValues: { is_active: true }, newValues: { is_active: false } })
    }
  })
}

/** F09 can pass its own transaction so loading and copying happen atomically. */
export async function getTemplateForUse(id: number, db: Queryable = getSharedPool()) {
  const template = await get(id, db)
  if (!template.is_active || !template.plan_is_active || (template.payment_term_id && !template.payment_term_is_active)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Template, plan and payment term must be active')
  }
  if (!template.items.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Template must have at least one item')
  const items = template.items.map((item) => {
    if (!item.product_is_active || (item.variant_id && (!item.variant_is_active || item.variant_product_id !== item.product_id)) || (item.tax_rule_id && !item.tax_rule_is_active)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Template contains an inactive or invalid reference')
    }
    const unit_price = item.unit_price_override ?? computeEffectivePrice({ sales_price: item.sales_price }, item.variant_id ? { price_adjustment: item.price_adjustment! } : undefined)
    return { ...item, unit_price }
  })
  return { ...template, items }
}
