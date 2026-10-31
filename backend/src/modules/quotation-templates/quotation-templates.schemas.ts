import { z } from 'zod'

const id = z.number().int().positive().safe()
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a non-negative amount with up to two decimal places')
export const templateItemSchema = z.object({
  product_id: id,
  variant_id: id.nullable().optional(),
  quantity: z.number().int().min(1).max(2147483647),
  unit_price_override: money.nullable().optional(),
  tax_rule_id: id.nullable().optional(),
}).strict()

const fields = {
  name: z.string().trim().min(1).max(120),
  plan_id: id,
  validity_days: z.number().int().min(1).max(2147483647),
  payment_term_id: id.max(32767).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1).max(500),
}
export const createTemplateSchema = z.object(fields).strict()
export const updateTemplateSchema = z.object(fields).partial().strict().refine((v) => Object.keys(v).length > 0, 'Provide at least one field')
export const templateIdSchema = z.object({ id: z.coerce.number().int().positive().safe() }).strict()
export const listTemplateSchema = z.object({
  q: z.string().trim().max(120).optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).safe().optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['name', '-name', 'created_at', '-created_at']).optional(),
}).strict()
export type TemplateItemInput = z.infer<typeof templateItemSchema>
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
export type ListTemplateQuery = z.infer<typeof listTemplateSchema>
