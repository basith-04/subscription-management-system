import { Router } from 'express'
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

export const taxesRouter = Router()

taxesRouter.get(
  '/',
  authenticate,
  requirePermission('taxes:read'),
  validate({ query: taxQuerySchema }),
  taxesController.list,
)

taxesRouter.get(
  '/:id',
  authenticate,
  requirePermission('taxes:read'),
  validate({ params: taxIdParamSchema }),
  taxesController.get,
)

taxesRouter.post(
  '/',
  authenticate,
  requirePermission('taxes:manage'),
  validate({ body: createTaxSchema }),
  taxesController.create,
)

taxesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('taxes:manage'),
  validate({ params: taxIdParamSchema, body: updateTaxSchema }),
  taxesController.update,
)

taxesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('taxes:manage'),
  validate({ params: taxIdParamSchema }),
  taxesController.delete,
)
