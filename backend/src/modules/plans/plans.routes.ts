// HTTP routes for plans — declares method + path + middleware chain.
// Admin: read + write. Staff: read-only. Customers: no direct access (F14 exposes plan info via subscriptions).
import { Router, type RequestHandler } from 'express'
import { ApiError } from '../../middleware/error-handler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './plans.controller.js'
import {
  createPlanBody,
  listPlansQuery,
  planIdParams,
  replacePlanProductsBody,
  updatePlanBody,
} from './plans.schemas.js'

const read = requireRole('admin', 'staff')
const write = requireRole('admin')

/**
 * Parsed list values go to res.locals.query for the existing plans controller.
 * Shared query validation also supports Express 5's getter-only req.query.
 */
const parseListQuery: RequestHandler = (req, res, next) => {
  const result = listPlansQuery.safeParse(req.query)
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message }))
    return next(new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', details))
  }
  res.locals.query = result.data
  next()
}

export function createPlansRouter(authenticateRequest: RequestHandler = authenticate): Router {
  const router = Router()
  router.use(authenticateRequest)
  router.get('/', read, parseListQuery, controller.listPlans)
  router.post('/', write, validate({ body: createPlanBody }), controller.createPlan)
  router.get('/:id', read, validate({ params: planIdParams }), controller.getPlan)
  router.patch('/:id', write, validate({ params: planIdParams, body: updatePlanBody }), controller.updatePlan)
  router.put(
    '/:id/products',
    write,
    validate({ params: planIdParams, body: replacePlanProductsBody }),
    controller.replacePlanProducts,
  )
  router.delete('/:id', write, validate({ params: planIdParams }), controller.deletePlan)
  return router
}

export const plansRouter = createPlansRouter()
