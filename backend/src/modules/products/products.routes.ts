import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import {
  createProductSchema, createVariantSchema, listProductsQuerySchema,
  productIdOnlyParamSchema, productIdParamSchema, updateProductSchema, updateVariantSchema, variantIdParamSchema,
} from './products.schemas.js'
import * as controller from './products.controller.js'

export const productsRouter = Router()
export const variantsRouter = Router()

productsRouter.get('/', authenticate, requireRole('admin', 'staff'), validate({ query: listProductsQuerySchema }), controller.listProducts)
productsRouter.post('/', authenticate, requireRole('admin'), validate({ body: createProductSchema }), controller.createProduct)
productsRouter.get('/:id', authenticate, requireRole('admin', 'staff'), validate({ params: productIdParamSchema }), controller.getProduct)
productsRouter.patch('/:id', authenticate, requireRole('admin'), validate({ params: productIdParamSchema, body: updateProductSchema }), controller.updateProduct)
productsRouter.delete('/:id', authenticate, requireRole('admin'), validate({ params: productIdParamSchema }), controller.deleteProduct)

productsRouter.get('/:productId/variants', authenticate, requireRole('admin', 'staff'), validate({ params: productIdOnlyParamSchema }), controller.listVariants)
productsRouter.post('/:productId/variants', authenticate, requireRole('admin'), validate({ params: productIdOnlyParamSchema, body: createVariantSchema }), controller.addVariant)

variantsRouter.patch('/:id', authenticate, requireRole('admin'), validate({ params: variantIdParamSchema, body: updateVariantSchema }), controller.updateVariant)
variantsRouter.delete('/:id', authenticate, requireRole('admin'), validate({ params: variantIdParamSchema }), controller.deleteVariant)
