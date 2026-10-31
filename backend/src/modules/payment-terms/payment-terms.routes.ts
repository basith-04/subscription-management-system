import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePermission } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import { paymentTermsController } from './payment-terms.controller.js'
import {
  createPaymentTermSchema,
  updatePaymentTermSchema,
  paymentTermQuerySchema,
  paymentTermIdParamSchema,
} from './payment-terms.schemas.js'

export const paymentTermsRouter = Router()

paymentTermsRouter.get(
  '/',
  authenticate,
  requirePermission('payment_terms:read'),
  validate({ query: paymentTermQuerySchema }),
  paymentTermsController.list,
)

paymentTermsRouter.get(
  '/:id',
  authenticate,
  requirePermission('payment_terms:read'),
  validate({ params: paymentTermIdParamSchema }),
  paymentTermsController.get,
)

paymentTermsRouter.post(
  '/',
  authenticate,
  requirePermission('payment_terms:manage'),
  validate({ body: createPaymentTermSchema }),
  paymentTermsController.create,
)

paymentTermsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('payment_terms:manage'),
  validate({ params: paymentTermIdParamSchema, body: updatePaymentTermSchema }),
  paymentTermsController.update,
)
