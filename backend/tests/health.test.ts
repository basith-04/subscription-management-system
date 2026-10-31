import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

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
