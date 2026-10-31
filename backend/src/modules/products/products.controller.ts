import type { Request, Response } from 'express'
import { created, list, noContent, ok } from '../../lib/responses.js'
import * as service from './products.service.js'
import type { CreateProductInput, CreateVariantInput, ListProductsQuery, UpdateProductInput, UpdateVariantInput } from './products.schemas.js'

export async function listProducts(req: Request, res: Response): Promise<void> {
  const result = await service.list(req.query as unknown as ListProductsQuery)
  list(res, result.data, result.meta)
}
export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await service.create(req.body as CreateProductInput)
  created(res, product, `/api/v1/products/${product.id}`)
}
export async function getProduct(req: Request, res: Response): Promise<void> {
  ok(res, await service.get(Number(req.params.id)))
}
export async function updateProduct(req: Request, res: Response): Promise<void> {
  ok(res, await service.update(Number(req.params.id), req.body as UpdateProductInput))
}
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  await service.remove(Number(req.params.id))
  noContent(res)
}
export async function listVariants(req: Request, res: Response): Promise<void> {
  ok(res, await service.listVariantsForProduct(Number(req.params.productId)))
}
export async function addVariant(req: Request, res: Response): Promise<void> {
  const productId = Number(req.params.productId)
  const variant = await service.addVariant(productId, req.body as CreateVariantInput)
  created(res, variant, `/api/v1/variants/${variant.id}`)
}
export async function updateVariant(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateVariant(Number(req.params.id), req.body as UpdateVariantInput))
}
export async function deleteVariant(req: Request, res: Response): Promise<void> {
  await service.removeVariant(Number(req.params.id))
  noContent(res)
}
