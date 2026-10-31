import type { Request, Response, NextFunction } from 'express'
import type { Pool } from 'pg'
import { ok, created } from '../../lib/response.js'
import { paymentTermsService } from './payment-terms.service.js'
import type {
  CreatePaymentTermInput,
  UpdatePaymentTermInput,
  PaymentTermQueryInput,
} from './payment-terms.schemas.js'

export const paymentTermsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as PaymentTermQueryInput
      const terms = await paymentTermsService.listPaymentTerms({
        isActive: query.is_active,
      }, req.app.locals.pool as Pool)
      ok(res, terms)
    } catch (err) {
      next(err)
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const term = await paymentTermsService.getPaymentTermById(id, req.app.locals.pool as Pool)
      ok(res, term)
    } catch (err) {
      next(err)
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreatePaymentTermInput
      const term = await paymentTermsService.createPaymentTerm(body, req.user!, req.app.locals.pool as Pool)
      created(res, term)
    } catch (err) {
      next(err)
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const body = req.body as UpdatePaymentTermInput
      const updated = await paymentTermsService.updatePaymentTerm(
        id,
        body,
        req.user!,
        req.app.locals.pool as Pool,
      )
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  },
}
