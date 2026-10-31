// Business rules and transactions for plans.
import { isPgError, withTransaction } from '../../lib/db.js'
import { buildMeta, parsePagination } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import { ApiError } from '../../middleware/error-handler.js'
import { PLAN_NAME_UNIQUE, POLICY_KEYS, type BillingFrequency, type PolicyKey } from './plans.constants.js'
import * as repo from './plans.repository.js'
import {
  isValidDateRange,
  type CreatePlanInput,
  type ListPlansQuery,
  type PlanProductInput,
  type UpdatePlanInput,
} from './plans.schemas.js'

// ---------------------------------------------------------------------------
// Response shape — the ONE representation of a plan, shared by every endpoint.
// `policies` is consumed by F09, F10 and F14; see docs/api/api-specification.md §6.
// ---------------------------------------------------------------------------
export type PlanPolicies = Record<PolicyKey, boolean>

export interface PlanDto {
  id: number
  name: string
  price: string
  billing_frequency: BillingFrequency
  min_quantity: number
  available_from: string
  available_to: string | null
  is_active: boolean
  notes: string | null
  policies: PlanPolicies
  created_at: string
  updated_at: string
}

export interface PlanListItemDto extends PlanDto {
  product_count: number
}

export interface PlanProductDto {
  id: number
  product_id: number
  product_name: string | null
  product_is_active: boolean | null
  variant_id: number | null
  variant_label: string | null
  variant_is_active: boolean | null
  default_quantity: number
  unit_price_override: string | null
}

export interface PlanDetailDto extends PlanDto {
  products: PlanProductDto[]
}

export function toPlanDto(row: repo.PlanRow): PlanDto {
  const policies = {} as PlanPolicies
  for (const key of POLICY_KEYS) policies[key] = row[key]
  return {
    id: Number(row.id),
    name: row.name,
    price: row.price,
    billing_frequency: row.billing_frequency,
    min_quantity: row.min_quantity,
    available_from: row.available_from,
    available_to: row.available_to,
    is_active: row.is_active,
    notes: row.notes,
    policies,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toProductDto(row: repo.PlanProductRow): PlanProductDto {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    product_name: row.product_name,
    product_is_active: row.product_is_active,
    variant_id: row.variant_id === null ? null : Number(row.variant_id),
    variant_label: row.variant_label,
    variant_is_active: row.variant_is_active,
    default_quantity: row.default_quantity,
    unit_price_override: row.unit_price_override,
  }
}

// ---------------------------------------------------------------------------
// Availability helper — exported (via index.ts) for F09 (quotations/subscriptions).
// ---------------------------------------------------------------------------
export interface PlanAvailabilityFields {
  is_active: boolean
  available_from: string
  available_to: string | null
}

/**
 * Throws 422 PLAN_NOT_AVAILABLE unless the plan can be sold for a subscription
 * starting on `startDate` (YYYY-MM-DD). Both bounds are inclusive; a null
 * `available_to` means open-ended. Pure: no I/O, never touches subscriptions.
 */
export function assertPlanAvailable(plan: PlanAvailabilityFields, startDate: string): void {
  if (!plan.is_active) {
    throw new ApiError(422, 'PLAN_NOT_AVAILABLE', 'Plan is not active')
  }
  if (startDate < plan.available_from) {
    throw new ApiError(422, 'PLAN_NOT_AVAILABLE', `Plan is available from ${plan.available_from}`)
  }
  if (plan.available_to !== null && startDate > plan.available_to) {
    throw new ApiError(422, 'PLAN_NOT_AVAILABLE', `Plan was available until ${plan.available_to}`)
  }
}

// ---------------------------------------------------------------------------
const SORT_COLUMNS: Record<string, string> = {
  name: 'p.name',
  price: 'p.price',
  available_from: 'p.available_from',
  created_at: 'p.created_at',
}

function buildOrderBy(sort: string | undefined): string {
  const parts = (sort ?? 'name').split(',').map((field) => {
    const desc = field.startsWith('-')
    return `${SORT_COLUMNS[field.replace(/^-/, '')]} ${desc ? 'DESC' : 'ASC'}`
  })
  return [...parts, 'p.id ASC'].join(', ')
}

export async function listPlans(
  query: ListPlansQuery,
): Promise<{ data: PlanListItemDto[]; meta: PageMeta }> {
  const { page, page_size, limit, offset } = parsePagination(query)
  const { rows, total } = await repo.listPlans(query, buildOrderBy(query.sort), limit, offset)
  return {
    data: rows.map((row) => ({ ...toPlanDto(row), product_count: row.product_count ?? 0 })),
    meta: buildMeta(total, page, page_size),
  }
}

function rethrowPlanWriteError(error: unknown): never {
  if (isPgError(error)) {
    if (error.code === '23505' && error.constraint === PLAN_NAME_UNIQUE) {
      throw new ApiError(409, 'CONFLICT', 'A plan with this name already exists')
    }
    if (error.code === '23514') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', [
        { field: error.constraint ?? '(root)', message: 'Violates a database constraint' },
      ])
    }
  }
  throw error
}

export async function createPlan(input: CreatePlanInput): Promise<PlanDetailDto> {
  try {
    const row = await repo.insertPlan(input)
    return { ...toPlanDto(row), products: [] }
  } catch (error) {
    return rethrowPlanWriteError(error)
  }
}

async function requirePlan(id: number): Promise<repo.PlanRow> {
  const row = await repo.findPlan(id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Plan not found')
  return row
}

export async function getPlan(id: number): Promise<PlanDetailDto> {
  const row = await requirePlan(id)
  const products = await repo.listPlanProducts(id)
  return { ...toPlanDto(row), products: products.map(toProductDto) }
}

/**
 * Updates plan fields/policies. This only edits the plan row: it never touches
 * subscriptions. Policies are read at action time (F10), `available_to` in the
 * past blocks only NEW sales (F09), and `min_quantity` applies to new/edited lines.
 */
export async function updatePlan(id: number, patch: UpdatePlanInput): Promise<PlanDetailDto> {
  const existing = await requirePlan(id)
  const merged = {
    available_from: patch.available_from ?? existing.available_from,
    available_to: patch.available_to === undefined ? existing.available_to : patch.available_to,
  }
  if (!isValidDateRange(merged)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', [
      { field: 'available_to', message: 'available_to must be on or after available_from' },
    ])
  }
  try {
    await repo.updatePlan(id, patch)
  } catch (error) {
    rethrowPlanWriteError(error)
  }
  return getPlan(id)
}

export async function replacePlanProducts(
  planId: number,
  products: PlanProductInput[],
): Promise<PlanProductDto[]> {
  return withTransaction(async (client) => {
    const db = repo.fromTx(client)
    // Lock the plan row so concurrent replacements serialize.
    if (!(await repo.findPlan(planId, db, true))) {
      throw new ApiError(404, 'NOT_FOUND', 'Plan not found')
    }
    await validateProductRows(products, db)
    await repo.deletePlanProducts(planId, db)
    for (const row of products) {
      await repo.insertPlanProduct(planId, row, db)
    }
    await repo.touchPlan(planId, db)
    return (await repo.listPlanProducts(planId, db)).map(toProductDto)
  })
}

async function validateProductRows(products: PlanProductInput[], db: repo.Queryable): Promise<void> {
  if (products.length === 0) return
  const errors: { field: string; message: string }[] = []

  const productIds = [...new Set(products.map((p) => p.product_id))]
  const found = new Map((await repo.findProducts(productIds, db)).map((p) => [Number(p.id), p]))

  const variantIds = [...new Set(products.flatMap((p) => (p.variant_id ? [p.variant_id] : [])))]
  const variants = new Map(
    (variantIds.length ? await repo.findVariants(variantIds, db) : []).map((v) => [Number(v.id), v]),
  )

  products.forEach((row, i) => {
    const product = found.get(row.product_id)
    if (!product) {
      errors.push({ field: `products.${i}.product_id`, message: 'Product does not exist' })
    } else if (!product.is_active) {
      errors.push({ field: `products.${i}.product_id`, message: 'Product is inactive' })
    }
    if (row.variant_id) {
      const variant = variants.get(row.variant_id)
      if (!variant) {
        errors.push({ field: `products.${i}.variant_id`, message: 'Variant does not exist' })
      } else if (Number(variant.product_id) !== row.product_id) {
        errors.push({
          field: `products.${i}.variant_id`,
          message: 'Variant does not belong to the selected product',
        })
      } else if (!variant.is_active) {
        errors.push({ field: `products.${i}.variant_id`, message: 'Variant is inactive' })
      }
    }
  })

  if (errors.length > 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', errors)
}

export async function deletePlan(id: number): Promise<void> {
  try {
    const deleted = await repo.deletePlan(id)
    if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'Plan not found')
  } catch (error) {
    // Subscriptions / quotation templates reference plans with ON DELETE RESTRICT.
    if (isPgError(error) && error.code === '23503') {
      throw new ApiError(409, 'IN_USE', 'Plan is in use and cannot be deleted; deactivate it instead')
    }
    throw error
  }
}
