import cors from 'cors'
import express, { type Express, type Request, type Response } from 'express'
import helmet from 'helmet'
import { loadConfig, type Config } from './config.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { requestId } from './middleware/request-id.js'
import { apiRouter, healthPayload } from './routes/index.js'

/**
 * Build the Express application.
 * Kept separate from `index.ts` so tests can exercise it without a listener.
 */
export function createApp(config: Config = loadConfig()): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(requestId)

  const health = (_req: Request, res: Response) => {
    res.json({ data: healthPayload() })
  }

  app.get('/healthz', health)
  app.get('/readyz', health)
  app.use('/api/v1', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
