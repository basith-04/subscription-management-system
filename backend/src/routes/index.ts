import { Router } from 'express'
import { VERSION } from '../version.js'
import { taxesRouter } from '../modules/taxes/index.js'
import { paymentTermsRouter } from '../modules/payment-terms/index.js'

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

apiRouter.use('/taxes', taxesRouter)
apiRouter.use('/payment-terms', paymentTermsRouter)
