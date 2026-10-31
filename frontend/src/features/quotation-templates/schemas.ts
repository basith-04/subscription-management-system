import { z } from 'zod'

const id = z.number().int().positive().safe()
export const templatePayloadSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  plan_id: id,
  validity_days: z.number().int().min(1).max(2147483647),
  payment_term_id: id.max(32767).nullable(),
  notes: z.string().max(2000).nullable(),
  items: z.array(z.object({
    product_id: id, variant_id: id.nullable(), quantity: z.number().int().min(1).max(2147483647),
    unit_price_override: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).nullable(), tax_rule_id: id.nullable(),
  }).strict()).min(1, 'Add at least one line').max(500),
}).strict()
