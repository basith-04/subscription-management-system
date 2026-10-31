import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { ok, created } from '../../lib/responses.js'
import * as service from './billing-runs.service.js'
import type { CreateRunInput, ListRunsQuery, UpcomingQuery, ManualCreateInvoiceInput } from './billing-runs.schemas.js'

const pool = (req: Request) => req.app.locals.pool as Pool

export async function startRun(req: Request, res: Response): Promise<void> {
  res.status(202).json({ data: await service.startRun(pool(req), req.body as CreateRunInput, req.user!.id) })
}

export async function list(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.list(pool(req), req.query as unknown as ListRunsQuery)
  res.status(200).json({ data, meta })
}

export async function get(req: Request, res: Response): Promise<void> {
  ok(res, await service.get(pool(req), Number(req.params.id)))
}

export async function upcoming(req: Request, res: Response): Promise<void> {
  ok(res, await service.upcoming(pool(req), req.query as unknown as UpcomingQuery))
}

export async function manualCreateInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await service.manualCreateInvoice(pool(req), req.body as ManualCreateInvoiceInput)
  created(res, invoice, `/api/v1/invoices/${invoice.id}`)
}
