import type { RequestHandler } from 'express'
import { ApiError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'

/**
 * Role gate for protected routes. The role comes from the database-backed
 * session, never from the request body or a client-supplied claim.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(
        new ApiError(
          401,
          ERROR_CODES.UNAUTHENTICATED,
          'Authentication required',
        ),
      )
      return
    }

    if (!roles.includes(req.user.role)) {
      next(
        new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You do not have permission to perform this action',
        ),
      )
      return
    }

    next()
  }
}
