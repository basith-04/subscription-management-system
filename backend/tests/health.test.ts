import express, { type RequestHandler } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { createApiRouter } from '../src/routes/index.js'
import type { AuthService } from '../src/modules/auth/auth.service.js'

const app = createApp(
  loadConfig({
    ALLOWED_ORIGINS: 'http://localhost:5173',
  } as NodeJS.ProcessEnv),
)

describe('health endpoints', () => {
  it('reports ok on the liveness probe', async () => {
    const response = await request(app).get('/healthz')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: {
        status: 'ok',
        service: 'brightloop-api',
        version: '0.1.0',
      },
    })
    expect(response.headers['x-request-id']).toBeTypeOf('string')
  })

  it('serves health under the versioned API', async () => {
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('ok')
  })
})

describe('error handling', () => {
  it('returns the error envelope for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
    expect(response.body.error.request_id).toBeTypeOf('string')
  })
})

describe('F05/F06 auth wiring', () => {
  it('uses the app-provided authentication middleware for protected routes', async () => {
    const injectedAuthenticate: RequestHandler = (_req, res) => {
      res.status(418).json({ source: 'injected-authenticate' })
    }
    const routerApp = express()
    routerApp.use(
      '/api/v1',
      createApiRouter({
        authService: {} as AuthService,
        config: loadConfig({
          ALLOWED_ORIGINS: 'http://localhost:5173',
        } as NodeJS.ProcessEnv),
        authenticate: injectedAuthenticate,
      }),
    )

    for (const [method, path] of [
      ['get', '/taxes'],
      ['get', '/payment-terms'],
      ['get', '/products'],
      ['patch', '/variants/1'],
    ] as const) {
      const response = await request(routerApp)[method](`/api/v1${path}`)
      expect(response.status).toBe(418)
      expect(response.body).toEqual({ source: 'injected-authenticate' })
    }
  })
})
