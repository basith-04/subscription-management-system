import { Router, type RequestHandler } from 'express'
import { requireRole } from '../../middleware/require-role.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './quotation-templates.controller.js'
import { createTemplateSchema, listTemplateSchema, templateIdSchema, updateTemplateSchema } from './quotation-templates.schemas.js'

export function createQuotationTemplatesRouter(authenticate: RequestHandler): Router {
  const router = Router()
  router.use(authenticate)
  router.get('/', requireRole('admin', 'staff'), validate({ query: listTemplateSchema }), controller.list)
  router.post('/', requireRole('admin'), validate({ body: createTemplateSchema }), controller.create)
  router.get('/:id', requireRole('admin', 'staff'), validate({ params: templateIdSchema }), controller.get)
  router.patch('/:id', requireRole('admin'), validate({ params: templateIdSchema, body: updateTemplateSchema }), controller.update)
  router.delete('/:id', requireRole('admin'), validate({ params: templateIdSchema }), controller.deactivate)
  return router
}
