import { Router } from 'express'
import { plansRouter } from '../modules/plans/plans.routes.js'
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

export const apiRouter = Router()

apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'Brightloop Subscription API',
      version: VERSION,
      docs: 'See docs/api/api-specification.md',
    },
  })
})

apiRouter.get('/health', (_req, res) => {
  res.json({ data: healthPayload() })
})

apiRouter.use('/plans', plansRouter)
