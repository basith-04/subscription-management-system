// /me/* customer self-service routes. Customer role ONLY: Admin and Staff get 403 (no privilege hierarchy here).
// Profile (/me/profile) is F04's router; actions (confirm, pause, …) are the F09/F10 endpoints, not duplicated here.
import { Router, type RequestHandler } from 'express'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './portal.controller.js'
import { idParams, listMyInvoicesQuery, listMySubscriptionsQuery } from './portal.schemas.js'

export function createPortalRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate, requireRole('customer'))
  router.get('/subscriptions', validate({ query: listMySubscriptionsQuery }), controller.listSubscriptions)
  router.get('/subscriptions/:id', validate({ params: idParams }), controller.getSubscription)
  router.get('/invoices', validate({ query: listMyInvoicesQuery }), controller.listInvoices)
  router.get('/invoices/:id', validate({ params: idParams }), controller.getInvoice)
  router.get('/invoices/:id/print', validate({ params: idParams }), controller.printInvoice)
  return router
}
