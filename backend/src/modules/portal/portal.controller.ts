// HTTP handlers for the portal — the customer id ALWAYS comes from scopeToCustomer(req) (the session), never the request.
import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { list as sendList, ok } from '../../lib/responses.js'
import { scopeToCustomer } from '../../middleware/permissions.js'
import type { ListMyInvoicesQuery, ListMySubscriptionsQuery } from './portal.schemas.js'
import * as service from './portal.service.js'

const pool = (req: Request) => req.app.locals.pool as Pool
const idParam = (req: Request) => Number(req.params.id)

export async function listSubscriptions(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.listSubscriptions(pool(req), scopeToCustomer(req), req.query as ListMySubscriptionsQuery)
  sendList(res, data, meta)
}
export async function getSubscription(req: Request, res: Response): Promise<void> {
  ok(res, await service.getSubscription(pool(req), scopeToCustomer(req), idParam(req)))
}
export async function listInvoices(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.listInvoices(pool(req), scopeToCustomer(req), req.query as ListMyInvoicesQuery)
  res.status(200).json({ data, meta })
}
export async function getInvoice(req: Request, res: Response): Promise<void> {
  ok(res, await service.getMyInvoice(pool(req), scopeToCustomer(req), idParam(req)))
}
export async function printInvoice(req: Request, res: Response): Promise<void> {
  const html = await service.renderMyInvoicePrint(pool(req), scopeToCustomer(req), idParam(req))
  res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(html)
}
