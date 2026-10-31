// Zod request schemas for products and product_variants.
import { z } from 'zod'

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Expected a decimal string with up to 2 decimals')
const productType = z.enum(['service', 'software', 'addon', 'physical'])

export const listProductsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  product_type: productType.optional(),
  is_active: z.enum(['true', 'false']).optional(),
  sort: z.enum(['name', '-name', 'sales_price', '-sales_price', 'created_at', '-created_at']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(150),
  product_type: productType,
  sales_price: money,
  cost_price: money.default('0.00'),
  notes: z.string().max(2000).optional(),
}).strict()

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  product_type: productType.optional(),
  sales_price: money.optional(),
  cost_price: money.optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const productIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const variantIdParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const productIdOnlyParamSchema = z.object({ productId: z.coerce.number().int().positive() })

export const createVariantSchema = z.object({
  attribute_name: z.string().trim().min(1).max(80),
  attribute_value: z.string().trim().min(1).max(80),
  price_adjustment: money.default('0.00'),
}).strict()

export const updateVariantSchema = z.object({
  attribute_name: z.string().trim().min(1).max(80).optional(),
  attribute_value: z.string().trim().min(1).max(80).optional(),
  price_adjustment: money.optional(),
  is_active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateVariantInput = z.infer<typeof createVariantSchema>
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>
