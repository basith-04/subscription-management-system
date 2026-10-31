// HTTP handlers for payments — parse validated input, call one service fn.
import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { created, list as sendList, ok } from '../../lib/responses.js'
import type { ListPaymentsQuery, RecordPaymentInput, VoidPaymentInput } from './payments.schemas.js'
import * as service from './payments.service.js'

const idParam = (req: Request) => Number(req.params.id)
const actor = (req: Request): service.Actor => ({ id: req.user!.id, role: req.user!.role, ip: req.ip ?? null })
const pool = (req: Request) => req.app.locals.pool as Pool

export async function list(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.list(pool(req), req.query as ListPaymentsQuery)
  sendList(res, data, meta)
}
export async function record(req: Request, res: Response): Promise<void> {
  const payment = await service.record(pool(req), req.body as RecordPaymentInput, actor(req))
  created(res, payment, `/api/v1/payments/${payment.id}`)
}
export async function get(req: Request, res: Response): Promise<void> {
  ok(res, await service.get(pool(req), idParam(req)))
}
export async function voidPayment(req: Request, res: Response): Promise<void> {
  ok(res, await service.voidPayment(pool(req), idParam(req), req.body as VoidPaymentInput, actor(req)))
}
export async function listForInvoice(req: Request, res: Response): Promise<void> {
  ok(res, await service.listForInvoice(pool(req), idParam(req)))
}
