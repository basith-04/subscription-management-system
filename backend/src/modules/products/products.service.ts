import { ApiError } from '../../middleware/error-handler.js'
import { isPgError } from '../../lib/db.js'
import { computeEffectivePrice } from '../../lib/pricing.js'
import { isNonNegative } from '../../lib/money.js'
import { parsePagination, buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import * as repo from './products.repository.js'
import type {
  CreateProductInput, CreateVariantInput, ListProductsQuery, UpdateProductInput, UpdateVariantInput,
} from './products.schemas.js'

export interface ProductResponse {
  id: number
  name: string
  product_type: string
  sales_price: string
  cost_price: string
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VariantResponse {
  id: number
  product_id: number
  attribute_name: string
  attribute_value: string
  price_adjustment: string
  effective_price: string
  is_active: boolean
  created_at: string
  updated_at: string
}

function toProductResponse(row: repo.ProductRow): ProductResponse {
  return {
    id: Number(row.id),
    name: row.name,
    product_type: row.product_type,
    sales_price: row.sales_price,
    cost_price: row.cost_price,
    notes: row.notes,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

function toVariantResponse(row: repo.VariantRow, product: repo.ProductRow): VariantResponse {
  const effective = computeEffectivePrice(
    { sales_price: product.sales_price },
    { price_adjustment: row.price_adjustment },
  )
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    attribute_name: row.attribute_name,
    attribute_value: row.attribute_value,
    price_adjustment: row.price_adjustment,
    effective_price: effective,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

function rethrowAsApi(error: unknown): never {
  if (isPgError(error)) {
    if (error.code === '23505') throw new ApiError(409, 'CONFLICT', 'A record with that value already exists')
    if (error.code === '23503') throw new ApiError(409, 'IN_USE', 'This record is referenced and cannot be deleted; deactivate it instead')
  }
  throw error
}

export async function list(query: ListProductsQuery): Promise<{ data: ProductResponse[]; meta: PageMeta }> {
  const p = parsePagination(query as Record<string, unknown>)
  const isActive = query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined
  const { rows, total } = await repo.listProducts({
    q: query.q, product_type: query.product_type, is_active: isActive, sort: query.sort, limit: p.limit, offset: p.offset,
  })
  return { data: rows.map(toProductResponse), meta: buildMeta(total, p.page, p.page_size) }
}

export async function get(id: number): Promise<ProductResponse & { variants: VariantResponse[] }> {
  const product = await repo.findProductById(id)
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  const variantRows = await repo.listVariants(id)
  return { ...toProductResponse(product), variants: variantRows.map((v) => toVariantResponse(v, product)) }
}

export async function create(input: CreateProductInput): Promise<ProductResponse> {
  try {
    return toProductResponse(await repo.insertProduct(input))
  } catch (error) { rethrowAsApi(error) }
}

export async function update(id: number, input: UpdateProductInput): Promise<ProductResponse> {
  const existing = await repo.findProductById(id)
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Product not found')

  if (input.sales_price !== undefined) {
    const variants = await repo.listVariants(id)
    for (const variant of variants) {
      const effective = computeEffectivePrice({ sales_price: input.sales_price }, { price_adjustment: variant.price_adjustment })
      if (!isNonNegative(effective)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Changing sales_price would make an active variant negative', [
          { field: 'sales_price', message: `Variant "${variant.attribute_name}=${variant.attribute_value}" would have effective price ${effective}` },
        ])
      }
    }
  }
  try {
    const row = await repo.updateProduct(id, input)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
    return toProductResponse(row)
  } catch (error) { rethrowAsApi(error) }
}

export async function remove(id: number): Promise<void> {
  if (!(await repo.findProductById(id))) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  try { await repo.deleteProduct(id) } catch (error) { rethrowAsApi(error) }
}

export async function listVariantsForProduct(productId: number): Promise<VariantResponse[]> {
  const product = await repo.findProductById(productId)
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  return (await repo.listVariants(productId)).map((row) => toVariantResponse(row, product))
}

export async function addVariant(productId: number, input: CreateVariantInput): Promise<VariantResponse> {
  const product = await repo.findProductById(productId)
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  computeEffectivePrice({ sales_price: product.sales_price }, { price_adjustment: input.price_adjustment })
  try { return toVariantResponse(await repo.insertVariant({ ...input, product_id: productId }), product) } catch (error) { rethrowAsApi(error) }
}

export async function updateVariant(id: number, input: UpdateVariantInput): Promise<VariantResponse> {
  const variant = await repo.findVariantById(id)
  if (!variant) throw new ApiError(404, 'NOT_FOUND', 'Variant not found')
  const product = await repo.findProductById(Number(variant.product_id))
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  computeEffectivePrice({ sales_price: product.sales_price }, { price_adjustment: input.price_adjustment ?? variant.price_adjustment })
  try {
    const row = await repo.updateVariant(id, input)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Variant not found')
    return toVariantResponse(row, product)
  } catch (error) { rethrowAsApi(error) }
}

export async function removeVariant(id: number): Promise<void> {
  if (!(await repo.findVariantById(id))) throw new ApiError(404, 'NOT_FOUND', 'Variant not found')
  try { await repo.deleteVariant(id) } catch (error) { rethrowAsApi(error) }
}

export { computeEffectivePrice } from '../../lib/pricing.js'
