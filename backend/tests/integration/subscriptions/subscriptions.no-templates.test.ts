// F09 without F08: the template tables do not exist yet on main, so creation from a template must fail cleanly (422)
// while plan-based creation and the lifecycle keep working, and no template foreign key is attached.
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPlan, createProduct, firstPaymentTerm } from '../../factories/catalogue.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createSubscriptionTestDb, type SubscriptionTestDb } from '../../helpers/subscriptions-test-db.js'

const dbAvailable = await canConnect()

describe.skipIf(!dbAvailable)('F09 when F08 templates are not migrated', () => {
  let fixture: SubscriptionTestDb
  let pool: Pool
  beforeAll(async () => { fixture = await createSubscriptionTestDb({ withTemplates: false }); pool = fixture.pool })
  afterAll(async () => { await fixture.teardown() })

  it('migrations apply without F08; the template FK is simply not attached yet', async () => {
    expect((await pool.query(`SELECT 1 FROM pg_constraint WHERE conname='fk_subscriptions_template_id'`)).rowCount).toBe(0)
    expect((await pool.query(`SELECT to_regclass('quotation_templates') AS t`)).rows[0].t).toBeNull()
  })

  it('template-based creation is a clear 422; plan-based creation works', async () => {
    const app = createTestApp(pool)
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    const customer = await createUser(pool, { email: 'c@example.com', role: 'customer' })
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'staff@example.com', password: 'Example!Pass123' })
    const cookie = { Cookie: cookiePair(login) }
    const planId = await createPlan(pool, { min_quantity: 1 })
    const base = { customer_id: customer.customer_id, start_date: '2099-01-01', expiry_date: '2099-12-31' }
    const t = await request(app).post('/api/v1/quotations').set(cookie).send({ ...base, template_id: 1 })
    expect(t.status).toBe(422); expect(t.body.error.details[0]).toMatchObject({ field: 'template_id' })
    const ok = await request(app).post('/api/v1/quotations').set(cookie).send({
      ...base, plan_id: planId, payment_term_id: await firstPaymentTerm(pool), items: [{ product_id: await createProduct(pool), quantity: 1 }] })
    expect(ok.status).toBe(201)
    const issue = await request(app).post(`/api/v1/quotations/${ok.body.data.id}/issue`).set(cookie).send({ valid_until: '2099-01-01' })
    expect(issue.status).toBe(200)
  })
})
