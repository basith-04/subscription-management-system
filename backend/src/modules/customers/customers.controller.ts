// HTTP handlers for customers — parse validated input, call one service fn.
import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { created, list as sendList, ok } from '../../lib/responses.js'
import { scopeToCustomer } from '../../middleware/permissions.js'
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
  UpdateOwnProfileInput,
} from './customers.schemas.js'
import * as service from './customers.service.js'

const customerId = (req: Request) => Number(req.params.id)
const actor = (req: Request): service.Actor => ({ id: req.user!.id, role: req.user!.role, ip: req.ip ?? null })
/** The pool injected into the app (same one F01 uses), so tests and prod share one connection config. */
const pool = (req: Request) => req.app.locals.pool as Pool

export async function list(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.list(req.query as ListCustomersQuery, pool(req))
  sendList(res, data, meta)
}

export async function create(req: Request, res: Response): Promise<void> {
  const customer = await service.create(pool(req), req.body as CreateCustomerInput, actor(req))
  created(res, customer, `/api/v1/customers/${customer.id}`)
}

export async function get(req: Request, res: Response): Promise<void> {
  ok(res, await service.get(customerId(req), pool(req)))
}

export async function update(req: Request, res: Response): Promise<void> {
  ok(res, await service.update(pool(req), customerId(req), req.body as UpdateCustomerInput, actor(req)))
}

export async function getOwnProfile(req: Request, res: Response): Promise<void> {
  ok(res, await service.getOwnProfile(scopeToCustomer(req), pool(req)))
}

export async function updateOwnProfile(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateOwnProfile(pool(req), scopeToCustomer(req), req.body as UpdateOwnProfileInput, actor(req)))
}
