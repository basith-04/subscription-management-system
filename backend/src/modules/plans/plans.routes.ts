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

export const plansRouter = Router()

plansRouter.use(authenticate)

const read = requireRole('admin', 'staff')
const write = requireRole('admin')

/**
 * Query validation kept module-local: the shared `validate({ query })` assigns to `req.query`,
 * which is getter-only in Express 5 and throws. Parsed values go to `res.locals.query` instead.
 * TODO: remove once the shared middleware is fixed by its owner (F00).
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

plansRouter.get('/', read, parseListQuery, controller.listPlans)
plansRouter.post('/', write, validate({ body: createPlanBody }), controller.createPlan)
plansRouter.get('/:id', read, validate({ params: planIdParams }), controller.getPlan)
plansRouter.patch('/:id', write, validate({ params: planIdParams, body: updatePlanBody }), controller.updatePlan)
plansRouter.put(
  '/:id/products',
  write,
  validate({ params: planIdParams, body: replacePlanProductsBody }),
  controller.replacePlanProducts,
)
plansRouter.delete('/:id', write, validate({ params: planIdParams }), controller.deletePlan)
