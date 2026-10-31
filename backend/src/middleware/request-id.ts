import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

/**
 * Attach a request ID to every response and expose it on `res.locals`
 * so error handlers can include it in the error envelope.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const id = req.header('x-request-id') ?? randomUUID()

  res.locals.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}
