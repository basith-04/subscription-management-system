import { Router, type RequestHandler } from 'express'
import type { Config } from '../config.js'
import { createAuthRouter } from '../modules/auth/auth.routes.js'
import type { AuthService } from '../modules/auth/auth.service.js'
import { createPlansRouter } from '../modules/plans/plans.routes.js'
import { VERSION } from '../version.js'

export interface HealthPayload {
  status: string
  service: string
  version: string
}

export function healthPayload(): HealthPayload {
  return {
    status: 'ok',
    service: 'brightloop-api',
    version: VERSION,
  }
}

export interface ApiRouterDependencies {
  authService: AuthService
  config: Config
  authenticate: RequestHandler
}

export function createApiRouter({
  authService,
  config,
  authenticate,
}: ApiRouterDependencies): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      data: {
        name: 'Brightloop Subscription API',
        version: VERSION,
        docs: 'See docs/api/api-specification.md',
      },
    })
  })

  router.get('/health', (_req, res) => {
    res.json({ data: healthPayload() })
  })

  router.use(
    '/auth',
    createAuthRouter({ service: authService, config, authenticate }),
  )
  router.use('/plans', createPlansRouter(authenticate))

  return router
}
