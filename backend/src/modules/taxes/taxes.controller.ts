import type { Request, Response, NextFunction } from 'express'
import { ok, created, noContent } from '../../lib/response.js'
import { taxesService } from './taxes.service.js'
import type { CreateTaxInput, UpdateTaxInput, TaxQueryInput } from './taxes.schemas.js'

export const taxesController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as TaxQueryInput
      const taxes = await taxesService.listTaxes({ isActive: query.is_active })
      ok(res, taxes)
    } catch (err) {
      next(err)
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const tax = await taxesService.getTaxById(id)
      ok(res, tax)
    } catch (err) {
      next(err)
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreateTaxInput
      const createdTax = await taxesService.createTax(body, req.user!)
      created(res, createdTax)
    } catch (err) {
      next(err)
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const body = req.body as UpdateTaxInput
      const updatedTax = await taxesService.updateTax(id, body, req.user!)
      ok(res, updatedTax)
    } catch (err) {
      next(err)
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      await taxesService.deleteTax(id, req.user!)
      noContent(res)
    } catch (err) {
      next(err)
    }
  },
}
