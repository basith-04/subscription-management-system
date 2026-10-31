// HTTP handlers for invoices — parse validated input, call one service fn.
import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import type { Config } from '../../config.js'
import { createMailer } from '../../lib/mailer.js'
import { ok } from '../../lib/responses.js'
import type {
  BulkConfirmInput,
  CancelInput,
  ListInvoicesQuery,
  SendInput,
  UpdateDraftInput,
} from './invoices.schemas.js'
import * as service from './invoices.service.js'

const invoiceId = (req: Request) => Number(req.params.id)
const actor = (req: Request): service.Actor => ({ id: req.user!.id, role: req.user!.role, ip: req.ip ?? null })
/** The pool injected into the app, shared with every other module. */
const pool = (req: Request) => req.app.locals.pool as Pool

/** SMTP mailer from config; tests may pre-set `app.locals.mailer` with a stub transport. */
export function mailerFor(config: Config) {
  return (req: Request): service.Mailer => {
    const locals = req.app.locals as { mailer?: service.Mailer }
    locals.mailer ??= createMailer(config.mail)
    return locals.mailer
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.list(pool(req), req.query as ListInvoicesQuery)
  res.status(200).json({ data, meta })
}

export async function get(req: Request, res: Response): Promise<void> {
  ok(res, await service.get(pool(req), invoiceId(req)))
}

export async function update(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateDraft(pool(req), invoiceId(req), req.body as UpdateDraftInput, actor(req)))
}

export async function confirm(req: Request, res: Response): Promise<void> {
  ok(res, await service.confirm(pool(req), invoiceId(req), actor(req)))
}

export async function bulkConfirm(req: Request, res: Response): Promise<void> {
  ok(res, await service.bulkConfirm(pool(req), req.body as BulkConfirmInput, actor(req)))
}

export async function cancel(req: Request, res: Response): Promise<void> {
  ok(res, await service.cancel(pool(req), invoiceId(req), req.body as CancelInput, actor(req)))
}

export function send(getMailer: (req: Request) => service.Mailer) {
  return async (req: Request, res: Response): Promise<void> => {
    ok(res, await service.send(pool(req), getMailer(req), invoiceId(req), req.body as SendInput, actor(req)))
  }
}

export async function print(req: Request, res: Response): Promise<void> {
  const html = await service.renderPrint(pool(req), invoiceId(req))
  res
    .status(200)
    .set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    .send(html)
}
