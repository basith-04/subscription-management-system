// Session authentication.
// TEMPORARY: while F01 is unimplemented, this reads X-User-Id / X-User-Role headers
// behind DEMO_AUTH_ENABLED=true. When F01 lands, replace with cookie-session
// verification against the DB; the interface (req.user = { id, role, customerId? })
// stays the same.
import type { RequestHandler } from 'express'
import { ApiError } from './error-handler.js'
import type { AuthenticatedRequestUser, Role } from './require-role.js'

export const authenticate: RequestHandler = (req, _res, next) => {
  if (process.env.DEMO_AUTH_ENABLED === 'true') {
    const userId = req.header('x-user-id')
    const role = req.header('x-user-role') as Role | undefined
    if (userId && role) {
      const user: AuthenticatedRequestUser = { id: Number.parseInt(userId, 10), role }
      ;(req as unknown as { user: AuthenticatedRequestUser }).user = user
      return next()
    }
  }
  return next(new ApiError(401, 'UNAUTHENTICATED', 'Not logged in'))
}