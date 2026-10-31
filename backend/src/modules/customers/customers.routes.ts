// HTTP routes for customers — declares method + path + middleware chain.
// /customers: Admin + Staff (is_active changes: Admin only, enforced in the service).
// /me/profile: Customer only; the customer is resolved from the session, never from the request.
import { Router, type RequestHandler } from 'express'
import { authenticate as defaultAuthenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './customers.controller.js'
import {
  createCustomerBody,
  customerIdParams,
  listCustomersQuery,
  updateCustomerBody,
  updateOwnProfileBody,
} from './customers.schemas.js'

export function createCustomersRouter(authenticate: RequestHandler = defaultAuthenticate): Router {
  const router = Router()
  const backOffice = requireRole('admin', 'staff')
  router.use(authenticate, backOffice)
  router.get('/', validate({ query: listCustomersQuery }), controller.list)
  router.post('/', validate({ body: createCustomerBody }), controller.create)
  router.get('/:id', validate({ params: customerIdParams }), controller.get)
  router.patch('/:id', validate({ params: customerIdParams, body: updateCustomerBody }), controller.update)
  return router
}

export function createMeRouter(authenticate: RequestHandler = defaultAuthenticate): Router {
  const router = Router()
  router.use(authenticate, requireRole('customer'))
  router.get('/profile', controller.getOwnProfile)
  router.patch('/profile', validate({ body: updateOwnProfileBody }), controller.updateOwnProfile)
  return router
}
