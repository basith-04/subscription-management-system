import { Router, type RequestHandler } from 'express'
import { requirePermission } from '../../middleware/rbac.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './billing-runs.controller.js'
import { createRunBody, listRunsQuery, runIdParams, upcomingQuery, manualCreateInvoiceBody } from './billing-runs.schemas.js'

export function createBillingRunsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate)

  // Billing endpoints
  router.post('/billing/runs', requirePermission('billing:run'), validate({ body: createRunBody }), controller.startRun)
  router.get('/billing/runs', requirePermission('billing:view'), validate({ query: listRunsQuery }), controller.list)
  router.get('/billing/runs/:id', requirePermission('billing:view'), validate({ params: runIdParams }), controller.get)
  router.get('/billing/upcoming', requirePermission('billing:view'), validate({ query: upcomingQuery }), controller.upcoming)

  // Manual invoice creation
  router.post('/invoices', requirePermission('invoices:manage'), validate({ body: manualCreateInvoiceBody }), controller.manualCreateInvoice)

  return router
}
