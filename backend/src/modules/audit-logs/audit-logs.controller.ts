import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import { list as sendList } from '../../lib/responses.js'
import type { ListAuditLogsQuery } from './audit-logs.schemas.js'
import * as service from './audit-logs.service.js'

export async function list(req: Request, res: Response): Promise<void> {
  const result = await service.list(req.app.locals.pool as Pool, req.query as unknown as ListAuditLogsQuery)
  sendList(res, result.data, result.meta)
}
