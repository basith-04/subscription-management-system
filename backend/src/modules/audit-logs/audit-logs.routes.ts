import { Router, type RequestHandler } from 'express'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './audit-logs.controller.js'
import { listAuditLogsQuery } from './audit-logs.schemas.js'

export function createAuditLogsRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate, requireRole('admin'))
  router.get('/', validate({ query: listAuditLogsQuery }), controller.list)
  return router
}
