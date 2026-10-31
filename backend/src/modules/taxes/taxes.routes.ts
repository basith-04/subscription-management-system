import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePermission } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { taxesController } from './taxes.controller.js'
import {
  createTaxSchema,
  updateTaxSchema,
  taxQuerySchema,
  taxIdParamSchema,
} from './taxes.schemas.js'

export function createTaxesRouter(
  authenticateRequest: RequestHandler = authenticate,
): Router {
  const taxesRouter = Router()

  taxesRouter.get(
    '/',
    authenticateRequest,
    requirePermission('taxes:read'),
    validate({ query: taxQuerySchema }),
    taxesController.list,
  )

  taxesRouter.get(
    '/:id',
    authenticateRequest,
    requirePermission('taxes:read'),
    validate({ params: taxIdParamSchema }),
    taxesController.get,
  )

  taxesRouter.post(
    '/',
    authenticateRequest,
    requirePermission('taxes:manage'),
    validate({ body: createTaxSchema }),
    taxesController.create,
  )

  taxesRouter.patch(
    '/:id',
    authenticateRequest,
    requirePermission('taxes:manage'),
    validate({ params: taxIdParamSchema, body: updateTaxSchema }),
    taxesController.update,
  )

  taxesRouter.delete(
    '/:id',
    authenticateRequest,
    requirePermission('taxes:manage'),
    validate({ params: taxIdParamSchema }),
    taxesController.delete,
  )

  return taxesRouter
}

export const taxesRouter = createTaxesRouter()
