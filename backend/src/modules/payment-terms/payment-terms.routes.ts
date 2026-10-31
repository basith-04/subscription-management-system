import { Router, type RequestHandler } from 'express'
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

export function createPaymentTermsRouter(
  authenticateRequest: RequestHandler = authenticate,
): Router {
  const paymentTermsRouter = Router()

  paymentTermsRouter.get(
    '/',
    authenticateRequest,
    requirePermission('payment_terms:read'),
    validate({ query: paymentTermQuerySchema }),
    paymentTermsController.list,
  )

  paymentTermsRouter.get(
    '/:id',
    authenticateRequest,
    requirePermission('payment_terms:read'),
    validate({ params: paymentTermIdParamSchema }),
    paymentTermsController.get,
  )

  paymentTermsRouter.post(
    '/',
    authenticateRequest,
    requirePermission('payment_terms:manage'),
    validate({ body: createPaymentTermSchema }),
    paymentTermsController.create,
  )

  paymentTermsRouter.patch(
    '/:id',
    authenticateRequest,
    requirePermission('payment_terms:manage'),
    validate({ params: paymentTermIdParamSchema, body: updatePaymentTermSchema }),
    paymentTermsController.update,
  )

  return paymentTermsRouter
}

export const paymentTermsRouter = createPaymentTermsRouter()
