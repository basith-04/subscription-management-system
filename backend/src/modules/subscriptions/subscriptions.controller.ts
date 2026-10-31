// HTTP handlers for quotations and subscriptions — parse validated input, call one service fn.
import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { created, list as sendList, ok } from '../../lib/responses.js'
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from './subscriptions.schemas.js'
import * as service from './subscriptions.service.js'

const idParam = (req: Request) => Number(req.params.id)
const pool = (req: Request) => req.app.locals.pool as Pool
const actor = (req: Request): service.Actor => ({
  id: req.user!.id, role: req.user!.role, customerId: req.user!.customer_id ?? null, ip: req.ip ?? null,
})

export const listQuotations = async (req: Request, res: Response) => {
  const { data, meta } = await service.list(pool(req), 'quotations', req.query as service.ListQuery)
  sendList(res, data, meta)
}
export const listSubscriptions = async (req: Request, res: Response) => {
  const { data, meta } = await service.list(pool(req), 'subscriptions', req.query as service.ListQuery)
  sendList(res, data, meta)
}
export const create = (base: string) => async (req: Request, res: Response) => {
  const dto = await service.create(pool(req), req.body as CreateSubscriptionInput, actor(req))
  created(res, dto, `/api/v1/${base}/${dto.id}`)
}
export const get = async (req: Request, res: Response) => ok(res, await service.get(pool(req), idParam(req)))
export const update = async (req: Request, res: Response) =>
  ok(res, await service.update(pool(req), idParam(req), req.body as UpdateSubscriptionInput, actor(req)))
export const issue = async (req: Request, res: Response) =>
  ok(res, await service.issue(pool(req), idParam(req), req.body as { valid_until?: string }, actor(req)))
export const confirm = async (req: Request, res: Response) => ok(res, await service.confirm(pool(req), idParam(req), actor(req)))
export const cancel = async (req: Request, res: Response) =>
  ok(res, await service.cancel(pool(req), idParam(req), req.body as { reason?: string }, actor(req)))
export const history = async (req: Request, res: Response) => ok(res, await service.getHistory(pool(req), idParam(req)))
