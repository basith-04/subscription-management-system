import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlanTestDb, TEST_DATABASE_URL, type PlanTestDb } from '../helpers/plans-test-db.js'
import { createUser } from '../factories/user.factory.js'
import { cookiePair } from '../helpers/cookies.js'

// Requires a reachable PostgreSQL 15+ in TEST_DATABASE_URL; skipped otherwise (e.g. CI without a DB service).
describe.skipIf(!TEST_DATABASE_URL)('plans API (integration)', () => {
  let db: PlanTestDb
  let app: import('express').Express
  let closePool: () => Promise<void>

  const cookies: Partial<Record<'admin' | 'staff' | 'customer', string>> = {}
  const as = (role: 'admin' | 'staff' | 'customer') => ({ Cookie: cookies[role]! })
  const api = () => request(app)

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Monthly Pro',
    price: '499.00',
    billing_frequency: 'monthly',
    min_quantity: 1,
    available_from: '2026-01-01',
    available_to: null,
    auto_close_on_end: true,
    allow_early_close: false,
    allow_pause: true,
    allow_renewal: true,
    ...over,
  })

  async function createPlan(over: Record<string, unknown> = {}) {
    const res = await api().post('/api/v1/plans').set(as('admin')).send(body(over))
    expect(res.status).toBe(201)
    return res.body.data as { id: number }
  }

  async function seedProduct(name: string, active = true) {
    const r = await db.admin.query('INSERT INTO products (name, is_active) VALUES ($1,$2) RETURNING id::int AS id', [name, active])
    return r.rows[0].id as number
  }
  async function seedVariant(productId: number) {
    const r = await db.admin.query(
      `INSERT INTO product_variants (product_id, attribute_name, attribute_value) VALUES ($1,'Brand','Odoo') RETURNING id::int AS id`,
      [productId],
    )
    return r.rows[0].id as number
  }

  beforeAll(async () => {
    db = await createPlanTestDb()
    const { createApp } = await import('../../src/app.js')
    const { loadConfig } = await import('../../src/config.js')
    closePool = (await import('../../src/lib/db.js')).closePool
    app = createApp(loadConfig({ DATABASE_URL: process.env.DATABASE_URL, ALLOWED_ORIGINS: 'http://localhost:5173', RATE_LIMIT_MAX: '1000' } as NodeJS.ProcessEnv))
    for (const role of ['admin', 'staff', 'customer'] as const) {
      await createUser(db.admin, { email: `${role}@plans.example.test`, role })
      const login = await request(app).post('/api/v1/auth/login').send({ email: `${role}@plans.example.test`, password: 'Example!Pass123' })
      expect(login.status).toBe(200)
      cookies[role] = cookiePair(login)
    }
  })
  afterAll(async () => {
    if (closePool) await closePool()
    if (db) await db.teardown()
  })
  beforeEach(() => db.reset())

  describe('authorization matrix', () => {
    it('does not accept forged demo identity headers', async () => {
      expect((await api().get('/api/v1/plans').set({ 'x-user-id': '1', 'x-user-role': 'admin' })).status).toBe(401)
    })
    it('rejects unauthenticated requests with 401', async () => {
      expect((await api().get('/api/v1/plans')).status).toBe(401)
    })

    it('lets admin read and write', async () => {
      const { id } = await createPlan()
      expect((await api().get('/api/v1/plans').set(as('admin'))).status).toBe(200)
      expect((await api().get(`/api/v1/plans/${id}`).set(as('admin'))).status).toBe(200)
      expect((await api().patch(`/api/v1/plans/${id}`).set(as('admin')).send({ notes: 'x' })).status).toBe(200)
      expect((await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({ products: [] })).status).toBe(200)
      expect((await api().delete(`/api/v1/plans/${id}`).set(as('admin'))).status).toBe(204)
    })

    it('lets staff read but not write', async () => {
      const { id } = await createPlan()
      expect((await api().get('/api/v1/plans').set(as('staff'))).status).toBe(200)
      expect((await api().get(`/api/v1/plans/${id}`).set(as('staff'))).status).toBe(200)
      for (const res of [
        await api().post('/api/v1/plans').set(as('staff')).send(body({ name: 'Other' })),
        await api().patch(`/api/v1/plans/${id}`).set(as('staff')).send({ notes: 'x' }),
        await api().put(`/api/v1/plans/${id}/products`).set(as('staff')).send({ products: [] }),
        await api().delete(`/api/v1/plans/${id}`).set(as('staff')),
      ]) {
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      }
    })

    it('gives customers no access', async () => {
      const { id } = await createPlan()
      expect((await api().get('/api/v1/plans').set(as('customer'))).status).toBe(403)
      expect((await api().get(`/api/v1/plans/${id}`).set(as('customer'))).status).toBe(403)
      expect((await api().post('/api/v1/plans').set(as('customer')).send(body())).status).toBe(403)
    })
  })

  describe('create / read back', () => {
    it.each(['daily', 'weekly', 'monthly', 'yearly'])('saves and reads back frequency %s', async (billing_frequency) => {
      const { id } = await createPlan({ name: `Plan ${billing_frequency}`, billing_frequency })
      const res = await api().get(`/api/v1/plans/${id}`).set(as('staff'))
      expect(res.body.data.billing_frequency).toBe(billing_frequency)
    })

    it('round-trips all four policies with one consistent shape across endpoints', async () => {
      const policies = { auto_close_on_end: false, allow_early_close: true, allow_pause: true, allow_renewal: false }
      const res = await api().post('/api/v1/plans').set(as('admin')).send(body(policies))
      expect(res.body.data.policies).toEqual(policies)
      expect(res.headers.location).toBe(`/api/v1/plans/${res.body.data.id}`)

      const detail = await api().get(`/api/v1/plans/${res.body.data.id}`).set(as('staff'))
      const list = await api().get('/api/v1/plans').set(as('staff'))
      expect(detail.body.data.policies).toEqual(policies)
      expect(list.body.data[0].policies).toEqual(policies)
      expect(detail.body.data.products).toEqual([])
      expect(detail.body.data).toMatchObject({ price: '499.00', available_from: '2026-01-01', available_to: null })
    })

    it('flips a single policy through PATCH without touching the others', async () => {
      const { id } = await createPlan()
      const res = await api().patch(`/api/v1/plans/${id}`).set(as('admin')).send({ allow_pause: false })
      expect(res.body.data.policies).toEqual({
        auto_close_on_end: true, allow_early_close: false, allow_pause: false, allow_renewal: true,
      })
    })
  })

  describe('validation and errors', () => {
    it('422 when available_to is before available_from', async () => {
      const res = await api().post('/api/v1/plans').set(as('admin')).send(body({ available_to: '2025-12-31' }))
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('422 when PATCH makes the stored range invalid', async () => {
      const { id } = await createPlan({ available_from: '2026-06-01' })
      const res = await api().patch(`/api/v1/plans/${id}`).set(as('admin')).send({ available_to: '2026-05-01' })
      expect(res.status).toBe(422)
    })

    it('409 on duplicate name (create and rename)', async () => {
      await createPlan({ name: 'Gold' })
      const dup = await api().post('/api/v1/plans').set(as('admin')).send(body({ name: 'Gold' }))
      expect(dup.status).toBe(409)
      const other = await createPlan({ name: 'Silver' })
      const rename = await api().patch(`/api/v1/plans/${other.id}`).set(as('admin')).send({ name: 'Gold' })
      expect(rename.status).toBe(409)
    })

    it('404 for a missing plan', async () => {
      expect((await api().get('/api/v1/plans/999').set(as('admin'))).status).toBe(404)
      expect((await api().patch('/api/v1/plans/999').set(as('admin')).send({ notes: 'x' })).status).toBe(404)
      expect((await api().put('/api/v1/plans/999/products').set(as('admin')).send({ products: [] })).status).toBe(404)
      expect((await api().delete('/api/v1/plans/999').set(as('admin'))).status).toBe(404)
    })

    it('422 on unknown list filters', async () => {
      expect((await api().get('/api/v1/plans?colour=red').set(as('admin'))).status).toBe(422)
    })

    it('allows end date in the past and min_quantity increase without touching subscriptions', async () => {
      const { id } = await createPlan()
      await db.admin.query('INSERT INTO subscriptions (plan_id) VALUES ($1)', [id])
      const res = await api()
        .patch(`/api/v1/plans/${id}`)
        .set(as('admin'))
        .send({ available_to: '2026-01-02', min_quantity: 10, allow_pause: false })
      expect(res.status).toBe(200)
      const subs = await db.admin.query('SELECT count(*)::int AS n FROM subscriptions WHERE plan_id = $1', [id])
      expect(subs.rows[0].n).toBe(1)
    })
  })

  describe('delete', () => {
    it('409 IN_USE when subscriptions reference the plan, 204 once unused', async () => {
      const { id } = await createPlan()
      await db.admin.query('INSERT INTO subscriptions (plan_id) VALUES ($1)', [id])
      const blocked = await api().delete(`/api/v1/plans/${id}`).set(as('admin'))
      expect(blocked.status).toBe(409)
      expect(blocked.body.error.code).toBe('IN_USE')
      await db.admin.query('DELETE FROM subscriptions')
      expect((await api().delete(`/api/v1/plans/${id}`).set(as('admin'))).status).toBe(204)
    })
  })

  describe('available_on filter', () => {
    it('applies inclusive bounds, open-ended plans and is_active', async () => {
      await createPlan({ name: 'Window', available_from: '2026-03-01', available_to: '2026-03-31' })
      await createPlan({ name: 'Open', available_from: '2026-01-01', available_to: null })
      await createPlan({ name: 'Inactive', available_from: '2026-01-01', is_active: false })
      const names = async (d: string) =>
        (await api().get(`/api/v1/plans?available_on=${d}&sort=name`).set(as('staff'))).body.data.map((p: { name: string }) => p.name)

      expect(await names('2026-02-28')).toEqual(['Open'])
      expect(await names('2026-03-01')).toEqual(['Open', 'Window'])
      expect(await names('2026-03-31')).toEqual(['Open', 'Window'])
      expect(await names('2026-04-01')).toEqual(['Open'])
      expect(await names('2025-12-31')).toEqual([])
    })

    it('filters by frequency, active flag and search text', async () => {
      await createPlan({ name: 'Alpha Daily', billing_frequency: 'daily' })
      await createPlan({ name: 'Beta Yearly', billing_frequency: 'yearly', is_active: false })
      const get = async (qs: string) => (await api().get(`/api/v1/plans?${qs}`).set(as('admin'))).body
      expect((await get('billing_frequency=yearly')).data).toHaveLength(1)
      expect((await get('is_active=false')).data[0].name).toBe('Beta Yearly')
      expect((await get('q=alph')).data[0].name).toBe('Alpha Daily')
      expect((await get('page_size=1')).meta).toMatchObject({ total: 2, total_pages: 2, page_size: 1 })
    })
  })

  describe('PUT /plans/:id/products', () => {
    it('replaces the whole list and returns it', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      const b = await seedProduct('B')
      const v = await seedVariant(a)
      const first = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
        products: [
          { product_id: a, variant_id: v, default_quantity: 2, unit_price_override: '10.50' },
          { product_id: b, default_quantity: 1 },
        ],
      })
      expect(first.status).toBe(200)
      expect(first.body.data).toHaveLength(2)
      expect(first.body.data[0]).toMatchObject({ product_id: a, variant_id: v, unit_price_override: '10.50', variant_label: 'Brand: Odoo' })

      const second = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
        products: [{ product_id: b, default_quantity: 3 }],
      })
      expect(second.body.data).toHaveLength(1)
      const detail = await api().get(`/api/v1/plans/${id}`).set(as('staff'))
      expect(detail.body.data.products).toHaveLength(1)
      expect(detail.body.data.products[0].default_quantity).toBe(3)
    })

    it('422 for a variant that belongs to a different product', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      const b = await seedProduct('B')
      const v = await seedVariant(a)
      const res = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
        products: [{ product_id: b, variant_id: v, default_quantity: 1 }],
      })
      expect(res.status).toBe(422)
      expect(res.body.error.details[0].message).toMatch(/does not belong/)
    })

    it('422 for inactive or unknown products, leaving the old list intact', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      const dead = await seedProduct('Dead', false)
      await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({ products: [{ product_id: a, default_quantity: 1 }] })
      for (const productId of [dead, 9999]) {
        const res = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
          products: [{ product_id: productId, default_quantity: 1 }],
        })
        expect(res.status).toBe(422)
      }
      expect((await api().get(`/api/v1/plans/${id}`).set(as('admin'))).body.data.products).toHaveLength(1)
    })

    it('rejects duplicate rows, including two NULL-variant rows, with 422', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      const res = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
        products: [{ product_id: a, default_quantity: 1 }, { product_id: a, default_quantity: 2 }],
      })
      expect(res.status).toBe(422)
    })

    it('enforces NULL-variant uniqueness at the database level', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      await db.admin.query('INSERT INTO plan_products (plan_id, product_id) VALUES ($1,$2)', [id, a])
      await expect(db.admin.query('INSERT INTO plan_products (plan_id, product_id) VALUES ($1,$2)', [id, a])).rejects.toMatchObject({ code: '23505' })
    })

    it('rolls back the whole replacement when one insert fails mid-way', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      const b = await seedProduct('B')
      const c = await seedProduct('C')
      await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
        products: [{ product_id: a, default_quantity: 1 }],
      })
      // Test-only trigger: the row with default_quantity = 77 fails AFTER the delete and an earlier insert succeeded.
      await db.admin.query(`
        CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.default_quantity = 77 THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER plan_products_boom BEFORE INSERT ON plan_products FOR EACH ROW EXECUTE FUNCTION boom();`)
      try {
        const res = await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({
          products: [{ product_id: b, default_quantity: 1 }, { product_id: c, default_quantity: 77 }],
        })
        expect(res.status).toBe(500)
      } finally {
        await db.admin.query('DROP TRIGGER plan_products_boom ON plan_products; DROP FUNCTION boom()')
      }
      const detail = await api().get(`/api/v1/plans/${id}`).set(as('admin'))
      expect(detail.body.data.products.map((p: { product_id: number }) => p.product_id)).toEqual([a])
    })

    it('still returns attached products that later became inactive, flagged', async () => {
      const { id } = await createPlan()
      const a = await seedProduct('A')
      await api().put(`/api/v1/plans/${id}/products`).set(as('admin')).send({ products: [{ product_id: a, default_quantity: 1 }] })
      await db.admin.query('UPDATE products SET is_active = false WHERE id = $1', [a])
      const detail = await api().get(`/api/v1/plans/${id}`).set(as('staff'))
      expect(detail.body.data.products[0]).toMatchObject({ product_id: a, product_is_active: false })
    })
  })
})
