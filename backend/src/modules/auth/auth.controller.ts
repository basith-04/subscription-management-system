import type { Request, RequestHandler } from 'express'
import type { Config } from '../../config.js'
import type { AuthUser } from '../../lib/auth-user.js'
import { ApiError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { created, noContent, ok } from '../../lib/responses.js'
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js'
import type { AuthService } from './auth.service.js'

function authenticatedUser(req: Request): AuthUser {
  if (!req.user) {
    throw new ApiError(
      401,
      ERROR_CODES.UNAUTHENTICATED,
      'Authentication required',
    )
  }

  return req.user
}

export interface AuthControllerDependencies {
  service: AuthService
  config: Config
}

export function createAuthController({
  service,
  config,
}: AuthControllerDependencies): {
  register: RequestHandler
  login: RequestHandler
  logout: RequestHandler
  me: RequestHandler
} {
  return {
    register: async (req, res) => {
      const result = await service.register(req.body, {
        ipAddress: req.ip ?? null,
      })

      setSessionCookie(res, result.token, config)
      created(res, {
        user: result.user,
        customer_id: result.customer_id,
      })
    },

    login: async (req, res) => {
      const result = await service.login(req.body, {
        ipAddress: req.ip ?? null,
      })

      setSessionCookie(res, result.token, config)
      ok(res, result.user)
    },

    logout: async (req, res) => {
      await service.logout(authenticatedUser(req), {
        ipAddress: req.ip ?? null,
      })

      clearSessionCookie(res, config)
      noContent(res)
    },

    me: (req, res) => {
      ok(res, service.getMe(authenticatedUser(req)))
    },
  }
}
