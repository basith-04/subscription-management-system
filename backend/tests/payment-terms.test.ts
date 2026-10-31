import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { dueDaysSchema } from '../src/modules/payment-terms/payment-terms.schemas.js'

describe('Payment Term Validation Unit Tests', () => {
  it('accepts zero days (0)', () => {
    expect(dueDaysSchema.parse(0)).toBe(0)
  })

  it('accepts positive integers (15, 30)', () => {
    expect(dueDaysSchema.parse(15)).toBe(15)
    expect(dueDaysSchema.parse(30)).toBe(30)
  })

  it('rejects negative values (-5)', () => {
    expect(() => dueDaysSchema.parse(-5)).toThrow()
  })

  it('rejects fractional values (15.5)', () => {
    expect(() => dueDaysSchema.parse(15.5)).toThrow()
  })
})

describe('Payment Terms API Integration Tests', () => {
  const app = createApp()

  beforeEach(() => {
    db.reset()
  })

  it('allows Admin to list payment terms and includes seeds', async () => {
    const res = await request(app)
      .get('/api/v1/payment-terms')
      .set('x-user-role', 'admin')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const names = res.body.data.map((p: { name: string }) => p.name)
    expect(names).toContain('Due on receipt')
    expect(names).toContain('Net 15')
    expect(names).toContain('Net 30')
  })

  it('allows Staff to read payment terms', async () => {
    const res = await request(app)
      .get('/api/v1/payment-terms')
      .set('x-user-role', 'staff')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('rejects anonymous requests with 401', async () => {
    const res = await request(app).get('/api/v1/payment-terms')
    expect(res.status).toBe(401)
  })

  it('rejects customer requests with 403', async () => {
    const res = await request(app)
      .get('/api/v1/payment-terms')
      .set('x-user-role', 'customer')

    expect(res.status).toBe(403)
  })

  it('allows Admin to create a payment term', async () => {
    const res = await request(app)
      .post('/api/v1/payment-terms')
      .set('x-user-role', 'admin')
      .send({ name: 'Net 45', due_days: 45 })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Net 45')
    expect(res.body.data.due_days).toBe(45)
    expect(res.body.data.is_active).toBe(true)

    // Verify audit log
    const auditLogs = db.getAuditLogs()
    const log = auditLogs.find(
      (l) => l.action === 'payment_term.create' && l.entity_id === res.body.data.id,
    )
    expect(log).toBeDefined()
  })

  it('forbids Staff from creating payment terms', async () => {
    const res = await request(app)
      .post('/api/v1/payment-terms')
      .set('x-user-role', 'staff')
      .send({ name: 'Staff Term', due_days: 10 })

    expect(res.status).toBe(403)
  })

  it('returns 409 on duplicate payment term name', async () => {
    const res = await request(app)
      .post('/api/v1/payment-terms')
      .set('x-user-role', 'admin')
      .send({ name: 'Net 30', due_days: 30 })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_NAME')
  })

  it('allows Admin to update and deactivate a payment term', async () => {
    const listRes = await request(app)
      .get('/api/v1/payment-terms')
      .set('x-user-role', 'admin')

    const net15 = listRes.body.data.find((p: { name: string }) => p.name === 'Net 15')
    expect(net15).toBeDefined()

    // Update
    const updateRes = await request(app)
      .patch(`/api/v1/payment-terms/${net15.id}`)
      .set('x-user-role', 'admin')
      .send({ due_days: 16 })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.due_days).toBe(16)

    // Deactivate
    const deactRes = await request(app)
      .patch(`/api/v1/payment-terms/${net15.id}`)
      .set('x-user-role', 'admin')
      .send({ is_active: false })

    expect(deactRes.status).toBe(200)
    expect(deactRes.body.data.is_active).toBe(false)

    // Verify audit log
    const auditLogs = db.getAuditLogs()
    const log = auditLogs.find(
      (l) => l.action === 'payment_term.deactivate' && l.entity_id === net15.id,
    )
    expect(log).toBeDefined()
  })

  it('forbids Staff from updating payment terms', async () => {
    const res = await request(app)
      .patch('/api/v1/payment-terms/1')
      .set('x-user-role', 'staff')
      .send({ due_days: 20 })

    expect(res.status).toBe(403)
  })

  it('does NOT expose DELETE endpoint for payment terms', async () => {
    const res = await request(app)
      .delete('/api/v1/payment-terms/1')
      .set('x-user-role', 'admin')

    // 404 or 405 because DELETE is intentionally not implemented
    expect(res.status).toBe(404)
  })
})
