import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

describe('untrusted identity headers', () => {
  const app = createApp()

  it.each(['/api/v1/taxes', '/api/v1/payment-terms', '/api/v1/products', '/api/v1/users', '/api/v1/plans'])
  ('rejects forged role and bearer credentials on %s', async (path) => {
    const header = await request(app).get(path).set('X-User-Role', 'admin').set('X-User-Id', '1')
    const bearer = await request(app).get(path).set('Authorization', 'Bearer admin-token')
    expect(header.status).toBe(401)
    expect(bearer.status).toBe(401)
  })
})
