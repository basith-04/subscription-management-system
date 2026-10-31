import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { created, list as listResponse, noContent, ok } from '../../lib/responses.js'
import * as service from './quotation-templates.service.js'
import type { ListTemplateQuery } from './quotation-templates.schemas.js'

const pool = (req: Request) => req.app.locals.pool as Pool
export async function list(req: Request, res: Response) { const r = await service.list(res.locals.query as ListTemplateQuery, pool(req)); listResponse(res, r.data, r.meta) }
export async function create(req: Request, res: Response) { const r = await service.create(req.body, req.user!.id, pool(req)); created(res, r, `/api/v1/quotation-templates/${r.id}`) }
export async function get(req: Request, res: Response) { ok(res, await service.get(Number(req.params.id), pool(req))) }
export async function update(req: Request, res: Response) { ok(res, await service.update(Number(req.params.id), req.body, req.user!.id, pool(req))) }
export async function deactivate(req: Request, res: Response) { await service.deactivate(Number(req.params.id), req.user!.id, pool(req)); noContent(res) }
