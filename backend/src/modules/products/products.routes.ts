import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import {
  createProductSchema, createVariantSchema, listProductsQuerySchema,
  productIdOnlyParamSchema, productIdParamSchema, updateProductSchema, updateVariantSchema, variantIdParamSchema,
} from './products.schemas.js'
import * as controller from './products.controller.js'

export function createProductsRouter(
  authenticateRequest: RequestHandler = authenticate,
): Router {
  const productsRouter = Router()

  productsRouter.get('/', authenticateRequest, requireRole('admin', 'staff'), validate({ query: listProductsQuerySchema }), controller.listProducts)
  productsRouter.post('/', authenticateRequest, requireRole('admin'), validate({ body: createProductSchema }), controller.createProduct)
  productsRouter.get('/:id', authenticateRequest, requireRole('admin', 'staff'), validate({ params: productIdParamSchema }), controller.getProduct)
  productsRouter.patch('/:id', authenticateRequest, requireRole('admin'), validate({ params: productIdParamSchema, body: updateProductSchema }), controller.updateProduct)
  productsRouter.delete('/:id', authenticateRequest, requireRole('admin'), validate({ params: productIdParamSchema }), controller.deleteProduct)

  productsRouter.get('/:productId/variants', authenticateRequest, requireRole('admin', 'staff'), validate({ params: productIdOnlyParamSchema }), controller.listVariants)
  productsRouter.post('/:productId/variants', authenticateRequest, requireRole('admin'), validate({ params: productIdOnlyParamSchema, body: createVariantSchema }), controller.addVariant)

  return productsRouter
}

export function createVariantsRouter(
  authenticateRequest: RequestHandler = authenticate,
): Router {
  const variantsRouter = Router()
  variantsRouter.patch('/:id', authenticateRequest, requireRole('admin'), validate({ params: variantIdParamSchema, body: updateVariantSchema }), controller.updateVariant)
  variantsRouter.delete('/:id', authenticateRequest, requireRole('admin'), validate({ params: variantIdParamSchema }), controller.deleteVariant)
  return variantsRouter
}

// Backwards-compatible exports for isolated route consumers.
export const productsRouter = createProductsRouter()
export const variantsRouter = createVariantsRouter()
