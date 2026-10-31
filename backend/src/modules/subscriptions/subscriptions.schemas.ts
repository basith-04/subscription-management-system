import { z } from 'zod'
import { isCalendarDate } from '../../lib/dates.js'

// Request shape only: existence, active flags, policies, ownership, minimum
// quantity, date rules involving today, and transitions belong in the service.
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const pathId = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer')
  .transform(Number).pipe(id)
const date = z.iso.date().refine(isCalendarDate, 'Must be a valid PostgreSQL calendar date')
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Must be a non-negative amount with at most two decimals')
const queryId = pathId.optional()
const page = pathId.optional()
const pageSize = z.string().regex(/^[1-9]\d*$/).transform(Number)
  .pipe(z.number().int().min(1).max(100)).optional()

export const subscriptionIdParams = z.object({ id: pathId }).strict()

export const subscriptionItemInput = z.object({
  product_id: id,
  variant_id: id.nullable().optional(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  unit_price: money.optional(),
  tax_rule_id: id.nullable().optional(),
}).strict()

const fields = {
  customer_id: id,
  template_id: id.optional(),
  plan_id: id.optional(),
  start_date: date,
  expiry_date: date,
  payment_term_id: id.optional(),
  items: z.array(subscriptionItemInput).optional(),
}

export const createSubscriptionBody = z.object(fields).strict().superRefine((value, ctx) => {
  if (!value.template_id && !value.plan_id) {
    ctx.addIssue({ code: 'custom', path: ['plan_id'], message: 'Select a template or a plan' })
  }
  if (value.expiry_date < value.start_date) {
    ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'Expiry must be on or after the start date' })
  }
})

export const updateSubscriptionBody = z.object(fields).partial().strict().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' })
  // If both ids are supplied, the service must verify the template's plan.
  if (value.start_date && value.expiry_date && value.expiry_date < value.start_date) {
    ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'Expiry must be on or after the start date' })
  }
})

export const issueQuotationBody = z.object({ valid_until: date.optional() }).strict()
export const confirmQuotationBody = z.object({}).strict()
export const cancelQuotationBody = z.object({ reason: z.string().trim().optional() }).strict()

const queryText = z.string().trim().max(120).optional()
const sortField = (allowed: readonly string[]) => z.string().refine(
  (value) => value.split(',').every((part) => part.length > 0 && allowed.includes(part.startsWith('-') ? part.slice(1) : part)),
  'Invalid sort field',
).optional()

export const listQuotationsQuery = z.object({
  status: z.enum(['draft', 'quotation']).optional(),
  customer_id: queryId,
  q: queryText,
  valid_until_to: date.optional(),
  page,
  page_size: pageSize,
  sort: sortField(['number', 'created_at', 'quotation_valid_until']),
}).strict()

export const listSubscriptionsQuery = z.object({
  status: z.enum(['draft', 'quotation', 'confirmed', 'active', 'closed']).optional(),
  customer_id: queryId,
  plan_id: queryId,
  paused: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  billing_frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  expiry_from: date.optional(),
  expiry_to: date.optional(),
  next_billing_to: date.optional(),
  q: queryText,
  page,
  page_size: pageSize,
  sort: sortField(['number', 'start_date', 'expiry_date', 'next_billing_date', 'created_at']),
}).strict().superRefine((value, ctx) => {
  if (value.expiry_from && value.expiry_to && value.expiry_to < value.expiry_from) {
    ctx.addIssue({ code: 'custom', path: ['expiry_to'], message: 'End of range must not precede start' })
  }
})

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionBody>
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionBody>
export type SubscriptionItemInput = z.infer<typeof subscriptionItemInput>
