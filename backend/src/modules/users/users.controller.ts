import type { Request, Response } from 'express'
import { created, list, ok } from '../../lib/responses.js'
import * as service from './users.service.js'
import type { CreateStaffInput, UpdateUserInput, ListUsersQuery } from './users.schemas.js'
import type { AuthenticatedRequestUser } from '../../middleware/require-role.js'

export async function listUsers(req: Request, res: Response) {
  const result = await service.list(req.query as unknown as ListUsersQuery)
  list(res, result.data, result.meta)
}
export async function getUser(req: Request, res: Response) {
  ok(res, await service.get(Number(req.params.id)))
}
export async function createStaff(req: Request, res: Response) {
  const actor = (req as any).user as AuthenticatedRequestUser
  const user = await service.createStaff(actor.id, req.body as CreateStaffInput)
  created(res, user, `/api/v1/users/${user.id}`)
}
export async function updateUser(req: Request, res: Response) {
  const actor = (req as any).user as AuthenticatedRequestUser
  const user = await service.update(actor.id, Number(req.params.id), req.body as UpdateUserInput)
  ok(res, user)
}
