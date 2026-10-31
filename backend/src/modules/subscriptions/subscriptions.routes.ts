// HTTP routes for quotations (/quotations) and subscriptions (/subscriptions); both use one service.
// Activate / pause / resume / renew / close (F10), invoices (F12) and discounts (F15) are NOT mounted here.
import { Router, type RequestHandler } from 'express'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './subscriptions.controller.js'
import {
  cancelQuotationBody, confirmQuotationBody, createSubscriptionBody, issueQuotationBody, listQuotationsQuery,
  listSubscriptionsQuery, subscriptionIdParams, updateSubscriptionBody,
} from './subscriptions.schemas.js'

const backOffice = requireRole('admin', 'staff')
const params = validate({ params: subscriptionIdParams })

export function createQuotationsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate)
  router.get('/', backOffice, validate({ query: listQuotationsQuery }), controller.listQuotations)
  router.post('/', backOffice, validate({ body: createSubscriptionBody }), controller.create('quotations'))
  router.get('/:id', backOffice, params, controller.get)
  router.patch('/:id', backOffice, validate({ params: subscriptionIdParams, body: updateSubscriptionBody }), controller.update)
  router.post('/:id/issue', backOffice, validate({ params: subscriptionIdParams, body: issueQuotationBody }), controller.issue)
  // Customers may confirm only their own quotation (ownership is enforced in the service: others get 404).
  router.post('/:id/confirm', requireRole('admin', 'staff', 'customer'), validate({ params: subscriptionIdParams, body: confirmQuotationBody }), controller.confirm)
  router.post('/:id/cancel', backOffice, validate({ params: subscriptionIdParams, body: cancelQuotationBody }), controller.cancel)
  return router
}

export function createSubscriptionsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate, backOffice)
  router.get('/', validate({ query: listSubscriptionsQuery }), controller.listSubscriptions)
  router.post('/', validate({ body: createSubscriptionBody }), controller.create('subscriptions'))
  router.get('/:id', params, controller.get)
  router.patch('/:id', validate({ params: subscriptionIdParams, body: updateSubscriptionBody }), controller.update)
  router.get('/:id/history', params, controller.history)
  return router
}
