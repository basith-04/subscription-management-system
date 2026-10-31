import { z } from 'zod'

const TAX_RATE_REGEX = /^\d{1,3}(\.\d{1,3})?$/

export function normalizeTaxRate(val: string | number): string {
  const strVal = typeof val === 'number' ? val.toString() : val.trim()
  if (!TAX_RATE_REGEX.test(strVal)) {
    throw new Error('Tax rate must be a decimal with at most 3 decimal places')
  }
  const num = Number.parseFloat(strVal)
  if (num < 0 || num > 100) {
    throw new Error('Tax rate must be between 0 and 100 inclusive')
  }
  return num.toFixed(3)
}

export const taxRateSchema = z
  .union([z.string(), z.number()])
  .refine(
    (val) => {
      const s = typeof val === 'number' ? val.toString() : val.trim()
      return TAX_RATE_REGEX.test(s)
    },
    { message: 'Rate must match format ^\\d{1,3}(\\.\\d{1,3})?$ (0 to 100 with up to 3 decimals)' },
  )
  .refine(
    (val) => {
      const s = typeof val === 'number' ? val.toString() : val.trim()
      const n = Number.parseFloat(s)
      return !Number.isNaN(n) && n >= 0 && n <= 100
    },
    { message: 'Rate must be between 0 and 100 inclusive' },
  )
  .transform((val) => {
    const s = typeof val === 'number' ? val.toString() : val.trim()
    const n = Number.parseFloat(s)
    return n.toFixed(3)
  })

export const createTaxSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters'),
  rate: taxRateSchema,
  is_active: z.boolean().optional(),
}).strict()

export const updateTaxSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(120, 'Name must be at most 120 characters').optional(),
  rate: taxRateSchema.optional(),
  is_active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field')

export const taxQuerySchema = z.object({
  is_active: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
}).strict()

export const taxIdParamSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/, 'ID must be a positive integer').refine((value) => Number.isSafeInteger(Number(value)), 'ID is too large'),
}).strict()

export type CreateTaxInput = z.infer<typeof createTaxSchema>
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>
export type TaxQueryInput = z.infer<typeof taxQuerySchema>
