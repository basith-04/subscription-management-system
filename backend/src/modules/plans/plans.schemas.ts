// Zod request schemas for plans (body, params, query).
import { z } from 'zod'
import { BILLING_FREQUENCIES, MAX_PLAN_PRODUCTS, PLAN_SORT_FIELDS } from './plans.constants.js'

const moneyString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Must be a non-negative amount with up to 2 decimals')

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, 'Not a valid calendar date')

const id = z.coerce.number().int().positive()

export const planIdParams = z.object({ id }).strict()

const planFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  price: moneyString,
  billing_frequency: z.enum(BILLING_FREQUENCIES),
  min_quantity: z.number().int().min(1, 'Minimum quantity must be at least 1'),
  available_from: dateString,
  available_to: dateString.nullable(),
  auto_close_on_end: z.boolean(),
  allow_early_close: z.boolean(),
  allow_pause: z.boolean(),
  allow_renewal: z.boolean(),
  notes: z.string().max(2000).nullable(),
  is_active: z.boolean(),
}

type DateRange = { available_from?: string | undefined; available_to?: string | null | undefined }

/** Returns true when the range is valid (or incomplete, e.g. a PATCH touching one date). */
export function isValidDateRange({ available_from, available_to }: DateRange): boolean {
  if (!available_from || !available_to) return true
  return available_to >= available_from
}

const rangeMessage = {
  message: 'available_to must be on or after available_from',
  path: ['available_to'],
}

export const createPlanBody = z
  .object({
    name: planFields.name,
    price: planFields.price,
    billing_frequency: planFields.billing_frequency,
    min_quantity: planFields.min_quantity.default(1),
    available_from: planFields.available_from,
    available_to: planFields.available_to.optional().default(null),
    auto_close_on_end: planFields.auto_close_on_end,
    allow_early_close: planFields.allow_early_close,
    allow_pause: planFields.allow_pause,
    allow_renewal: planFields.allow_renewal,
    notes: planFields.notes.optional().default(null),
    is_active: planFields.is_active.default(true),
  })
  .strict()
  .refine(isValidDateRange, rangeMessage)

export const updatePlanBody = z
  .object({
    name: planFields.name,
    price: planFields.price,
    billing_frequency: planFields.billing_frequency,
    min_quantity: planFields.min_quantity,
    available_from: planFields.available_from,
    available_to: planFields.available_to,
    auto_close_on_end: planFields.auto_close_on_end,
    allow_early_close: planFields.allow_early_close,
    allow_pause: planFields.allow_pause,
    allow_renewal: planFields.allow_renewal,
    notes: planFields.notes,
    is_active: planFields.is_active,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
  .refine(isValidDateRange, rangeMessage)

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true')

export const listPlansQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    billing_frequency: z.enum(BILLING_FREQUENCIES).optional(),
    is_active: boolQuery.optional(),
    available_on: dateString.optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    sort: z
      .string()
      .refine(
        (s) =>
          s
            .split(',')
            .every((f) => (PLAN_SORT_FIELDS as readonly string[]).includes(f.replace(/^-/, ''))),
        `sort must be a comma list of: ${PLAN_SORT_FIELDS.join(', ')} (prefix - for descending)`,
      )
      .optional(),
  })
  .strict()

const planProductRow = z
  .object({
    product_id: z.number().int().positive(),
    variant_id: z.number().int().positive().nullable().optional(),
    default_quantity: z.number().int().min(1, 'Default quantity must be at least 1'),
    unit_price_override: moneyString.nullable().optional(),
  })
  .strict()

export const replacePlanProductsBody = z
  .object({
    products: z.array(planProductRow).max(MAX_PLAN_PRODUCTS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.products.forEach((row, index) => {
      const key = `${row.product_id}:${row.variant_id ?? 'none'}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['products', index],
          message: 'Duplicate product/variant row',
        })
      }
      seen.add(key)
    })
  })

export type CreatePlanInput = z.infer<typeof createPlanBody>
export type UpdatePlanInput = z.infer<typeof updatePlanBody>
export type ListPlansQuery = z.infer<typeof listPlansQuery>
export type PlanProductInput = z.infer<typeof planProductRow>
