// HTTP routes for invoices — declares method + path + middleware chain.
// Back office only (Admin + Staff). Customer-facing invoice access (/me/invoices*) belongs to F14.
// NOT here: POST /invoices and billing runs (F12), /invoices/:id/payments (F13).
import { Router, type RequestHandler } from 'express'
import type { Config } from '../../config.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './invoices.controller.js'
import {
  bulkConfirmBody,
  cancelBody,
  invoiceIdParams,
  listInvoicesQuery,
  printQuery,
  sendBody,
  updateDraftBody,
} from './invoices.schemas.js'

export function createInvoicesRouter(authenticate: RequestHandler, config: Config): Router {
  const router = Router()
  router.use(authenticate, requireRole('admin', 'staff'))

  router.get('/', validate({ query: listInvoicesQuery }), controller.list)
  // Static path registered before `/:id` routes.
  router.post('/bulk-confirm', validate({ body: bulkConfirmBody }), controller.bulkConfirm)
  router.get('/:id', validate({ params: invoiceIdParams }), controller.get)
  router.patch('/:id', validate({ params: invoiceIdParams, body: updateDraftBody }), controller.update)
  router.post('/:id/confirm', validate({ params: invoiceIdParams }), controller.confirm)
  router.post('/:id/cancel', validate({ params: invoiceIdParams, body: cancelBody }), controller.cancel)
  router.post(
    '/:id/send',
    validate({ params: invoiceIdParams, body: sendBody }),
    controller.send(controller.mailerFor(config)),
  )
  router.get('/:id/print', validate({ params: invoiceIdParams, query: printQuery }), controller.print)
  return router
}
