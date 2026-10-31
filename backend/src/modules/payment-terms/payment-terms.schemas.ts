import { z } from 'zod'

export const dueDaysSchema = z
  .number()
  .int('due_days must be an integer')
  .min(0, 'due_days must be greater than or equal to 0')
  .max(2147483647, 'due_days is too large')

export const createPaymentTermSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters'),
  due_days: dueDaysSchema,
  is_active: z.boolean().optional(),
}).strict()

export const updatePaymentTermSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(120, 'Name must be at most 120 characters').optional(),
  due_days: dueDaysSchema.optional(),
  is_active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field')

export const paymentTermQuerySchema = z.object({
  is_active: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
}).strict()

export const paymentTermIdParamSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/, 'ID must be a positive integer').refine((value) => Number(value) <= 32767, 'ID is too large'),
}).strict()

export type CreatePaymentTermInput = z.infer<typeof createPaymentTermSchema>
export type UpdatePaymentTermInput = z.infer<typeof updatePaymentTermSchema>
export type PaymentTermQueryInput = z.infer<typeof paymentTermQuerySchema>
