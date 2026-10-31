import { Router, type RequestHandler } from 'express'
import type { Config } from '../../config.js'
import { createAuthRateLimiter } from '../../middleware/rate-limit.js'
import { validate } from '../../middleware/validate.js'
import { createAuthController } from './auth.controller.js'
import { loginSchema, registerSchema } from './auth.schemas.js'
import type { AuthService } from './auth.service.js'

export interface AuthRouterDependencies {
  service: AuthService
  config: Config
  authenticate: RequestHandler
}

export function createAuthRouter({
  service,
  config,
  authenticate,
}: AuthRouterDependencies): Router {
  const router = Router()
  const controller = createAuthController({ service, config })
  const rateLimiter = createAuthRateLimiter(config)

  router.post(
    '/register',
    rateLimiter,
    validate({ body: registerSchema }),
    controller.register,
  )

  router.post(
    '/login',
    rateLimiter,
    validate({ body: loginSchema }),
    controller.login,
  )

  router.post('/logout', authenticate, controller.logout)
  router.get('/me', authenticate, controller.me)

  return router
}
