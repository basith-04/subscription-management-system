// HTTP routes for payments. Back office only: record/list/detail = Admin + Staff, void = Admin.
// There is deliberately no DELETE and no PATCH: mistakes are corrected by voiding and re-recording.
import { Router, type RequestHandler } from 'express'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './payments.controller.js'
import { listPaymentsQuery, paymentIdParams, recordPaymentBody, voidPaymentBody } from './payments.schemas.js'

export function createPaymentsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate, requireRole('admin', 'staff'))
  router.get('/', validate({ query: listPaymentsQuery }), controller.list)
  router.post('/', validate({ body: recordPaymentBody }), controller.record)
  router.get('/:id', validate({ params: paymentIdParams }), controller.get)
  router.post('/:id/void', requireRole('admin'), validate({ params: paymentIdParams, body: voidPaymentBody }), controller.voidPayment)
  return router
}

/** GET /invoices/:id/payments — mounted under /invoices next to the F11 router (which it falls through from). */
export function createInvoicePaymentsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.get('/:id/payments', authenticate, requireRole('admin', 'staff'), validate({ params: paymentIdParams }), controller.listForInvoice)
  return router
}
