import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express, type Request, type Response } from 'express'
import helmet from 'helmet'
import type { Pool } from 'pg'
import { loadConfig, type Config } from './config.js'
import { getSharedPool } from './lib/db.js'
import { createAuthenticate } from './middleware/authenticate.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { originCheck } from './middleware/origin-check.js'
import { requestId } from './middleware/request-id.js'
import { createAuthRepository } from './modules/auth/auth.repository.js'
import { createAuthService } from './modules/auth/auth.service.js'
import { createApiRouter, healthPayload } from './routes/index.js'

export interface AppDependencies {
  /** Injected by tests; otherwise a pool is created from config. */
  pool?: Pool
}

/**
 * Build the Express application.
 * Kept separate from `index.ts` so tests can exercise it without a listener.
 */
export function createApp(
  config: Config = loadConfig(),
  dependencies: AppDependencies = {},
): Express {
  const app = express()
  const pool = dependencies.pool ?? getSharedPool(config.databaseUrl)
  const authRepository = createAuthRepository(pool)
  const authService = createAuthService({
    repo: authRepository,
    config,
  })
  const authenticate = createAuthenticate({
    repo: authRepository,
    config,
  })

  app.locals.pool = pool

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requestId)
  app.use(originCheck(config))

  const health = (_req: Request, res: Response) => {
    res.json({ data: healthPayload() })
  }

  app.get('/healthz', health)
  app.get('/readyz', health)
  app.use(
    '/api/v1',
    createApiRouter({ authService, config, authenticate }),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
