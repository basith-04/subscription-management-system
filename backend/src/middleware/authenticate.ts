import type { RequestHandler } from 'express'
import type { Config } from '../config.js'
import type { AuthUser } from '../lib/auth-user.js'
import { ApiError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'
import { verifySessionToken } from '../lib/session.js'
import type { AuthRepository } from '../modules/auth/auth.repository.js'

export interface AuthenticateDependencies {
  repo: AuthRepository
  config: Config
}

/**
 * Validate the signed cookie and reload the user from the database on every
 * request. Deleted, inactive or tampered sessions are rejected.
 */
export function createAuthenticate({
  repo,
  config,
}: AuthenticateDependencies): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token: unknown = req.cookies?.[config.cookie.name]
      if (typeof token !== 'string' || token.length === 0) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHENTICATED,
          'Authentication required',
        )
      }

      const session = await verifySessionToken(token, config)
      if (!session) {
        throw new ApiError(
          401,
          ERROR_CODES.SESSION_EXPIRED,
          'Your session has expired. Please sign in again.',
        )
      }

      const user = await repo.transaction((tx) =>
        repo.findUserById(tx, session.user_id),
      )

      if (!user) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHENTICATED,
          'Authentication required',
        )
      }

      if (!user.is_active) {
        throw new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'This account is disabled. Contact an administrator.',
        )
      }

      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        customer_id: user.customer_id,
      }
      req.user = authUser
      next()
    } catch (error) {
      next(error)
    }
  }
}
