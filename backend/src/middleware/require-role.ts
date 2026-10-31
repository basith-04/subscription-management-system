// Role gate — 403 FORBIDDEN when the logged-in user's role is not in the allowed list.
import type { RequestHandler } from 'express'
import { ApiError } from './error-handler.js'

export type Role = 'admin' | 'staff' | 'customer'

export interface AuthenticatedRequestUser {
  id: number
  role: Role
  customerId?: number
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = (req as unknown as { user?: AuthenticatedRequestUser }).user
    if (!user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Not logged in'))
    if (!roles.includes(user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'))
    }
    next()
  }
}