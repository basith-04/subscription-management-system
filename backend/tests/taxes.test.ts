import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { normalizeTaxRate, taxRateSchema } from '../src/modules/taxes/taxes.schemas.js'

describe('Tax Rate Validation Unit Tests', () => {
  it('accepts valid integer percentages', () => {
    expect(normalizeTaxRate('5')).toBe('5.000')
    expect(normalizeTaxRate(18)).toBe('18.000')
    expect(taxRateSchema.parse('5')).toBe('5.000')
    expect(taxRateSchema.parse(18)).toBe('18.000')
  })

  it('accepts valid decimal percentages', () => {
    expect(normalizeTaxRate('18.5')).toBe('18.500')
    expect(normalizeTaxRate('18.75')).toBe('18.750')
    expect(normalizeTaxRate('18.125')).toBe('18.125')
    expect(taxRateSchema.parse('18.125')).toBe('18.125')
  })

  it('accepts zero boundary (0)', () => {
    expect(normalizeTaxRate('0')).toBe('0.000')
    expect(normalizeTaxRate(0)).toBe('0.000')
    expect(taxRateSchema.parse('0')).toBe('0.000')
  })

  it('accepts one hundred boundary (100)', () => {
    expect(normalizeTaxRate('100')).toBe('100.000')
    expect(normalizeTaxRate(100)).toBe('100.000')
    expect(taxRateSchema.parse('100')).toBe('100.000')
  })

  it('rejects negative rates', () => {
    expect(() => normalizeTaxRate('-1')).toThrow()
    expect(() => taxRateSchema.parse('-1')).toThrow()
    expect(() => taxRateSchema.parse(-5)).toThrow()
  })

  it('rejects rates above 100', () => {
    expect(() => normalizeTaxRate('100.001')).toThrow()
    expect(() => normalizeTaxRate('105')).toThrow()
    expect(() => taxRateSchema.parse('100.1')).toThrow()
    expect(() => taxRateSchema.parse(105)).toThrow()
  })

  it('rejects rates with more than three decimal places', () => {
    expect(() => normalizeTaxRate('18.1234')).toThrow()
    expect(() => taxRateSchema.parse('18.1234')).toThrow()
  })
})

describe('Tax Rules API Integration Tests', () => {
  const app = createApp()

  beforeEach(() => {
    db.reset()
  })

  it('allows Admin to list taxes and includes seeds', async () => {
    const res = await request(app)
      .get('/api/v1/taxes')
      .set('x-user-role', 'admin')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const names = res.body.data.map((t: { name: string }) => t.name)
    expect(names).toContain('GST 5%')
    expect(names).toContain('GST 12%')
    expect(names).toContain('GST 18%')
  })

  it('allows Staff to read taxes', async () => {
    const res = await request(app)
      .get('/api/v1/taxes')
      .set('x-user-role', 'staff')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('rejects anonymous requests with 401', async () => {
    const res = await request(app).get('/api/v1/taxes')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects customer requests with 403', async () => {
    const res = await request(app)
      .get('/api/v1/taxes')
      .set('x-user-role', 'customer')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('allows Admin to create a tax rule and preserves decimal precision', async () => {
    const res = await request(app)
      .post('/api/v1/taxes')
      .set('x-user-role', 'admin')
      .send({ name: 'Special VAT 7.5%', rate: '7.5' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Special VAT 7.5%')
    expect(res.body.data.rate).toBe('7.500')
    expect(res.body.data.is_active).toBe(true)

    // Verify audit log
    const auditLogs = db.getAuditLogs()
    const createLog = auditLogs.find(
      (l) => l.action === 'tax.create' && l.entity_id === res.body.data.id,
    )
    expect(createLog).toBeDefined()
  })

  it('returns 409 on duplicate tax name', async () => {
    const res = await request(app)
      .post('/api/v1/taxes')
      .set('x-user-role', 'admin')
      .send({ name: 'GST 18%', rate: '18.000' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_NAME')
  })

  it('forbids Staff from creating taxes', async () => {
    const res = await request(app)
      .post('/api/v1/taxes')
      .set('x-user-role', 'staff')
      .send({ name: 'Staff Tax', rate: '10.000' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('allows Admin to update tax rate and deactivates tax', async () => {
    // List to get id of GST 18%
    const listRes = await request(app)
      .get('/api/v1/taxes')
      .set('x-user-role', 'admin')
    const gst18 = listRes.body.data.find((t: { name: string }) => t.name === 'GST 18%')
    expect(gst18).toBeDefined()

    // Update rate
    const updateRes = await request(app)
      .patch(`/api/v1/taxes/${gst18.id}`)
      .set('x-user-role', 'admin')
      .send({ rate: '19.000' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.rate).toBe('19.000')

    // Deactivate
    const deactivateRes = await request(app)
      .patch(`/api/v1/taxes/${gst18.id}`)
      .set('x-user-role', 'admin')
      .send({ is_active: false })

    expect(deactivateRes.status).toBe(200)
    expect(deactivateRes.body.data.is_active).toBe(false)

    // Verify audit logs
    const auditLogs = db.getAuditLogs()
    const deactLog = auditLogs.find(
      (l) => l.action === 'tax.deactivate' && l.entity_id === gst18.id,
    )
    expect(deactLog).toBeDefined()
  })

  it('forbids Staff from updating taxes', async () => {
    const res = await request(app)
      .patch('/api/v1/taxes/1')
      .set('x-user-role', 'staff')
      .send({ rate: '20.000' })

    expect(res.status).toBe(403)
  })

  it('deletes an unreferenced tax rule with 204', async () => {
    // Create new tax
    const createRes = await request(app)
      .post('/api/v1/taxes')
      .set('x-user-role', 'admin')
      .send({ name: 'Temp Tax', rate: '2.500' })

    const id = createRes.body.data.id

    const deleteRes = await request(app)
      .delete(`/api/v1/taxes/${id}`)
      .set('x-user-role', 'admin')

    expect(deleteRes.status).toBe(204)

    // Verify it is gone
    const getRes = await request(app)
      .get(`/api/v1/taxes/${id}`)
      .set('x-user-role', 'admin')
    expect(getRes.status).toBe(404)
  })

  it('returns 409 IN_USE when deleting a referenced tax rule (FK 23503)', async () => {
    // Create a tax rule
    const createRes = await request(app)
      .post('/api/v1/taxes')
      .set('x-user-role', 'admin')
      .send({ name: 'Referenced Tax', rate: '15.000' })

    const id = createRes.body.data.id

    // Mark as referenced (simulating subscription_items reference)
    db.addTaxReference(id)

    const deleteRes = await request(app)
      .delete(`/api/v1/taxes/${id}`)
      .set('x-user-role', 'admin')

    expect(deleteRes.status).toBe(409)
    expect(deleteRes.body.error.code).toBe('IN_USE')
    expect(deleteRes.body.error.message).toBe('Deactivate it instead')
  })

  it('filters active taxes with is_active query param', async () => {
    const listRes = await request(app)
      .get('/api/v1/taxes')
      .set('x-user-role', 'admin')
    const firstTax = listRes.body.data[0]

    // Deactivate first
    await request(app)
      .patch(`/api/v1/taxes/${firstTax.id}`)
      .set('x-user-role', 'admin')
      .send({ is_active: false })

    const activeRes = await request(app)
      .get('/api/v1/taxes?is_active=true')
      .set('x-user-role', 'admin')

    const activeIds = activeRes.body.data.map((t: { id: string }) => t.id)
    expect(activeIds).not.toContain(firstTax.id)

    const inactiveRes = await request(app)
      .get('/api/v1/taxes?is_active=false')
      .set('x-user-role', 'admin')

    const inactiveIds = inactiveRes.body.data.map((t: { id: string }) => t.id)
    expect(inactiveIds).toContain(firstTax.id)
  })
})
