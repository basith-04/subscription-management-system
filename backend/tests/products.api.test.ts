import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import request from 'supertest'

process.env.DEMO_AUTH_ENABLED = 'true'
if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

const { createApp } = await import('../src/app.js')
const { query, closePool } = await import('../src/lib/db.js')
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(__dirname, '../db/migrations/20261115000000_f06_products_and_variants.sql')
const app = createApp()

const asAdmin = (r: request.Test) => r.set('X-User-Id', '1').set('X-User-Role', 'admin')
const asStaff = (r: request.Test) => r.set('X-User-Id', '2').set('X-User-Role', 'staff')

let dbAvailable = false

beforeAll(async () => {
  try {
    await query('SELECT 1')
    dbAvailable = true
    await query(`DROP TABLE IF EXISTS product_variants CASCADE`)
    await query(`DROP TABLE IF EXISTS products CASCADE`)
    await query(readFileSync(migrationPath, 'utf-8'))
  } catch {
    console.warn('skipping products api tests: PostgreSQL is not reachable')
  }
})
afterAll(async () => { if (dbAvailable) await closePool() })

describe('Products API', () => {
  it('creates a product as Admin (201)', async () => {
    if (!dbAvailable) return
    const res = await asAdmin(request(app).post('/api/v1/products').send({ name: 'Platform', product_type: 'software', sales_price: '1000.00', cost_price: '200.00' }))
    expect(res.status).toBe(201)
    expect(res.headers.location).toBe(`/api/v1/products/${res.body.data.id}`)
  })
  it('rejects Staff (403)', async () => {
    if (!dbAvailable) return
    const res = await asStaff(request(app).post('/api/v1/products').send({ name: 'Should fail', product_type: 'software', sales_price: '1.00' }))
    expect(res.status).toBe(403)
  })
  it('creates variant with computed effective_price (Odoo +560)', async () => {
    if (!dbAvailable) return
    const res = await asAdmin(request(app).post('/api/v1/products/1/variants').send({ attribute_name: 'Brand', attribute_value: 'Odoo', price_adjustment: '560.00' }))
    expect(res.status).toBe(201)
    expect(res.body.data.effective_price).toBe('1560.00')
  })
})
