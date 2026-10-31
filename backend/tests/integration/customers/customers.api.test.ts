import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect, createTestPool, prepareDatabase, resetData } from '../../helpers/db.js'

const dbAvailable = await canConnect()
const PASSWORD = 'Example!Pass123'

describe.skipIf(!dbAvailable)('F04 customers API', () => {
  let pool: Pool
  let app: Express
  const cookies: Record<string, string> = {}

  async function loginAs(key: string, email: string) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })
    expect(res.status).toBe(200)
    cookies[key] = cookiePair(res)
  }
  const as = (key: string) => ({ Cookie: cookies[key] ?? '' })

  beforeAll(async () => {
    pool = createTestPool()
    await prepareDatabase(pool)
    app = createTestApp(pool)
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(async () => {
    await resetData(pool)
    await createUser(pool, { email: 'admin@example.com', role: 'admin' })
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    const a = await createUser(pool, { email: 'alice@example.com', role: 'customer', fullName: 'Alice Customer' })
    await createUser(pool, { email: 'bob@example.com', role: 'customer', fullName: 'Bob Customer' })
    expect(a.customer_id).not.toBeNull()
    await loginAs('admin', 'admin@example.com')
    await loginAs('staff', 'staff@example.com')
    await loginAs('alice', 'alice@example.com')
    await loginAs('bob', 'bob@example.com')
  })

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Zed Corp Contact', email: 'zed@example.com', company_name: 'Zed Corp', phone: '+91 98765 43210',
    address: { line1: '1 Main St', city: 'Kochi', country: 'India' }, tax_id: 'GST123', notes: 'internal note', ...over,
  })
  const auditActions = async (id: number) =>
    (await pool.query<{ action: string }>("SELECT action FROM audit_logs WHERE entity_type='customer' AND entity_id=$1 ORDER BY id", [id])).rows.map((r) => r.action)
  const customerIdOf = async (email: string) =>
    Number((await pool.query<{ id: string }>('SELECT id FROM customers WHERE email = $1', [email])).rows[0]?.id)

  describe('role matrix', () => {
    it('requires authentication', async () => {
      expect((await request(app).get('/api/v1/customers')).status).toBe(401)
      expect((await request(app).get('/api/v1/me/profile')).status).toBe(401)
    })

    it('lets admin and staff list, create, read and edit', async () => {
      for (const role of ['admin', 'staff']) {
        const created = await request(app).post('/api/v1/customers').set(as(role)).send(body({ email: `${role}@new.example.com`, name: `By ${role}` }))
        expect(created.status).toBe(201)
        const id = created.body.data.id as number
        expect(created.headers.location).toBe(`/api/v1/customers/${id}`)
        expect((await request(app).get('/api/v1/customers').set(as(role))).status).toBe(200)
        expect((await request(app).get(`/api/v1/customers/${id}`).set(as(role))).status).toBe(200)
        const patched = await request(app).patch(`/api/v1/customers/${id}`).set(as(role)).send({ phone: '+91 11111 22222', notes: 'edited' })
        expect(patched.status).toBe(200)
        expect(patched.body.data.phone).toBe('+91 11111 22222')
      }
    })

    it('forbids staff from changing is_active (403) but allows admin to deactivate and reactivate', async () => {
      const id = (await request(app).post('/api/v1/customers').set(as('staff')).send(body())).body.data.id as number
      const denied = await request(app).patch(`/api/v1/customers/${id}`).set(as('staff')).send({ is_active: false })
      expect(denied.status).toBe(403)
      expect(denied.body.error.code).toBe('FORBIDDEN')
      expect((await request(app).get(`/api/v1/customers/${id}`).set(as('staff'))).body.data.is_active).toBe(true)

      const off = await request(app).patch(`/api/v1/customers/${id}`).set(as('admin')).send({ is_active: false })
      expect(off.status).toBe(200)
      expect(off.body.data.is_active).toBe(false)
      const on = await request(app).patch(`/api/v1/customers/${id}`).set(as('admin')).send({ is_active: true })
      expect(on.body.data.is_active).toBe(true)
      expect(await auditActions(id)).toEqual(['customer.create', 'customer.deactivate', 'customer.reactivate'])
    })

    it('denies customers on every /customers route', async () => {
      const id = await customerIdOf('bob@example.com')
      for (const res of [
        await request(app).get('/api/v1/customers').set(as('alice')),
        await request(app).post('/api/v1/customers').set(as('alice')).send(body()),
        await request(app).get(`/api/v1/customers/${id}`).set(as('alice')),
        await request(app).patch(`/api/v1/customers/${id}`).set(as('alice')).send({ name: 'Hacked' }),
      ]) {
        expect(res.status).toBe(403)
      }
      expect((await pool.query("SELECT name FROM customers WHERE id=$1", [id])).rows[0].name).toBe('Bob Customer')
    })

    it('denies back-office users on /me/profile', async () => {
      expect((await request(app).get('/api/v1/me/profile').set(as('staff'))).status).toBe(403)
      expect((await request(app).patch('/api/v1/me/profile').set(as('admin')).send({ name: 'x' })).status).toBe(403)
    })
  })

  describe('validation and errors', () => {
    it('422 for invalid input and 404 for an unknown customer', async () => {
      const bad = await request(app).post('/api/v1/customers').set(as('staff')).send({ name: '', email: 'nope' })
      expect(bad.status).toBe(422)
      expect(bad.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'name'])
      expect((await request(app).get('/api/v1/customers/99999').set(as('staff'))).status).toBe(404)
      expect((await request(app).patch('/api/v1/customers/99999').set(as('staff')).send({ name: 'x' })).status).toBe(404)
      expect((await request(app).get('/api/v1/customers/abc').set(as('staff'))).status).toBe(422)
    })

    it('stores long values up to the limits and Unicode intact', async () => {
      const name = 'അനു 山田 Zoë 😀'
      const res = await request(app).post('/api/v1/customers').set(as('staff')).send(body({
        name, address: { line1: 'ß'.repeat(200), city: 'München' },
      }))
      expect(res.status).toBe(201)
      const read = await request(app).get(`/api/v1/customers/${res.body.data.id}`).set(as('staff'))
      expect(read.body.data.name).toBe(name)
      expect(read.body.data.address.line1).toBe('ß'.repeat(200))
      expect((await request(app).post('/api/v1/customers').set(as('staff')).send(body({ name: 'x'.repeat(121) }))).status).toBe(422)
    })

    it('warns about a duplicate email without rejecting or linking (D-09)', async () => {
      await request(app).post('/api/v1/customers').set(as('staff')).send(body())
      const dup = await request(app).post('/api/v1/customers').set(as('staff')).send(body({ name: 'Second Zed', email: 'ZED@example.com' }))
      expect(dup.status).toBe(201)
      expect(dup.body.data.warnings).toEqual([expect.objectContaining({ field: 'email' })])
      expect(dup.body.data.has_portal_login).toBe(false)
      const rows = await pool.query("SELECT user_id FROM customers WHERE email='zed@example.com'")
      expect(rows.rows).toHaveLength(2)
      expect(rows.rows.every((r) => r.user_id === null)).toBe(true)
      // a self-registered user with the same email is not auto-linked either
      await createUser(pool, { email: 'zed@example.com', role: 'customer' })
      expect((await pool.query("SELECT count(*)::int AS n FROM customers WHERE email='zed@example.com' AND user_id IS NULL")).rows[0].n).toBe(2)
    })

    it('warns on an email change that collides with another record', async () => {
      const a = (await request(app).post('/api/v1/customers').set(as('staff')).send(body())).body.data.id as number
      const res = await request(app).patch(`/api/v1/customers/${a}`).set(as('staff')).send({ email: 'alice@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.data.warnings).toEqual([expect.objectContaining({ field: 'email' })])
    })
  })

  describe('list, search, sort, pagination', () => {
    beforeEach(async () => {
      for (const [name, email, company, active] of [
        ['Charlie Brown', 'charlie@peanuts.example', 'Peanuts Inc', true],
        ['Anna Müller', 'anna@alpen.example', 'Alpen GmbH', true],
        ['Bea Okafor', 'bea@lagos.example', null, false],
      ] as const) {
        const r = await request(app).post('/api/v1/customers').set(as('admin')).send({ name, email, ...(company ? { company_name: company } : {}) })
        if (!active) await request(app).patch(`/api/v1/customers/${r.body.data.id}`).set(as('admin')).send({ is_active: false })
      }
    })
    const names = async (qs: string) => (await request(app).get(`/api/v1/customers?${qs}`).set(as('staff'))).body.data.map((c: { name: string }) => c.name)

    it('searches name, email and company; filters by active', async () => {
      expect(await names('q=müller')).toEqual(['Anna Müller'])
      expect(await names('q=lagos.example')).toEqual(['Bea Okafor'])
      expect(await names('q=peanuts')).toEqual(['Charlie Brown'])
      expect(await names('q=%25')).toEqual([])
      expect(await names('is_active=false&sort=name')).toEqual(['Bea Okafor'])
      expect(await names('is_active=true&sort=name')).toEqual(['Alice Customer', 'Anna Müller', 'Bob Customer', 'Charlie Brown'])
    })

    it('sorts and paginates', async () => {
      expect((await names('sort=-name')).slice(0, 2)).toEqual(['Charlie Brown', 'Bob Customer'])
      expect((await names('sort=created_at')).slice(-3)).toEqual(['Charlie Brown', 'Anna Müller', 'Bea Okafor'])
      const page2 = await request(app).get('/api/v1/customers?sort=name&page=2&page_size=2').set(as('staff'))
      expect(page2.body.meta).toEqual({ page: 2, page_size: 2, total: 5, total_pages: 3 })
      expect(page2.body.data.map((c: { name: string }) => c.name)).toEqual(['Bea Okafor', 'Bob Customer'])
      expect(Object.keys(page2.body.data[0]).sort()).toEqual(['company_name', 'email', 'id', 'is_active', 'name', 'phone'])
    })

    it('rejects unknown filters and sorts with 422', async () => {
      expect((await request(app).get('/api/v1/customers?role=admin').set(as('staff'))).status).toBe(422)
      expect((await request(app).get('/api/v1/customers?sort=email').set(as('staff'))).status).toBe(422)
    })
  })

  describe('detail', () => {
    it('does not fabricate future summary fields', async () => {
      const id = await customerIdOf('alice@example.com')
      const res = await request(app).get(`/api/v1/customers/${id}`).set(as('staff'))
      expect(res.body.data).toMatchObject({ subscriptions_count: null, outstanding_amount: null, overdue_amount: null, has_portal_login: true })
      expect(res.body.data).not.toHaveProperty('user_id')
    })

    it('allows deactivation with a warning when active subscriptions exist, leaving them untouched', async () => {
      const id = await customerIdOf('alice@example.com')
      await pool.query('CREATE TABLE subscriptions (id serial PRIMARY KEY, customer_id bigint REFERENCES customers(id), status text)')
      try {
        await pool.query("INSERT INTO subscriptions (customer_id, status) VALUES ($1,'active')", [id])
        const res = await request(app).patch(`/api/v1/customers/${id}`).set(as('admin')).send({ is_active: false })
        expect(res.status).toBe(200)
        expect(res.body.data.warnings).toEqual([expect.objectContaining({ field: 'is_active', message: expect.stringMatching(/1 active subscription/) })])
        expect((await pool.query("SELECT status FROM subscriptions")).rows[0].status).toBe('active')
      } finally {
        await pool.query('DROP TABLE subscriptions')
      }
    })
  })

  describe('audit logging', () => {
    it('records create, update (changed fields only) and actor', async () => {
      const created = await request(app).post('/api/v1/customers').set(as('staff')).send(body())
      const id = created.body.data.id as number
      await request(app).patch(`/api/v1/customers/${id}`).set(as('staff')).send({ phone: '+91 22222 33333', name: body().name })
      const rows = await pool.query("SELECT action, actor_user_id, old_values, new_values FROM audit_logs WHERE entity_type='customer' AND entity_id=$1 ORDER BY id", [id])
      expect(rows.rows.map((r) => r.action)).toEqual(['customer.create', 'customer.update'])
      expect(rows.rows[1].old_values).toEqual({ phone: '+91 98765 43210' })
      expect(rows.rows[1].new_values).toEqual({ phone: '+91 22222 33333' })
      expect(rows.rows[0].actor_user_id).not.toBeNull()
    })

    it('writes nothing for a no-op update', async () => {
      const id = (await request(app).post('/api/v1/customers').set(as('staff')).send(body())).body.data.id as number
      await request(app).patch(`/api/v1/customers/${id}`).set(as('staff')).send({ name: body().name })
      expect(await auditActions(id)).toEqual(['customer.create'])
    })
  })

  describe('/me/profile', () => {
    it('returns only the caller own record, without staff notes or the active flag', async () => {
      const res = await request(app).get('/api/v1/me/profile').set(as('alice'))
      expect(res.status).toBe(200)
      expect(res.body.data.email).toBe('alice@example.com')
      for (const key of ['notes', 'is_active', 'user_id', 'has_portal_login']) expect(res.body.data).not.toHaveProperty(key)
      const bob = await request(app).get('/api/v1/me/profile').set(as('bob'))
      expect(bob.body.data.email).toBe('bob@example.com')
    })

    it('lets a customer update name, company, phone and address', async () => {
      const res = await request(app).patch('/api/v1/me/profile').set(as('alice')).send({
        name: 'Alice Ünïcode', company_name: 'Alice LLC', phone: '+91 99999 88888', address: { line1: '5 Lake Rd', city: 'Kochi' },
      })
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ name: 'Alice Ünïcode', company_name: 'Alice LLC', phone: '+91 99999 88888' })
      expect(res.body.data.address).toMatchObject({ line1: '5 Lake Rd', city: 'Kochi', country: null })
      const id = await customerIdOf('alice@example.com')
      expect(await auditActions(id)).toEqual(['customer.profile_update'])
    })

    it.each([
      ['email', { email: 'evil@example.com' }],
      ['is_active', { is_active: false }],
      ['notes', { notes: 'x' }],
      ['tax_id', { tax_id: 'x' }],
      ['user_id', { user_id: 1 }],
      ['id', { id: 1 }],
      ['customer_id', { customer_id: 1 }],
    ])('rejects %s (mass assignment) and changes nothing', async (_field, extra) => {
      const before = await pool.query('SELECT * FROM customers ORDER BY id')
      const res = await request(app).patch('/api/v1/me/profile').set(as('alice')).send({ name: 'Renamed', ...extra })
      expect(res.status).toBe(422)
      expect((await pool.query('SELECT * FROM customers ORDER BY id')).rows).toEqual(before.rows)
    })

    it('ignores a client-supplied customer id in path or query: only the session decides', async () => {
      const bobId = await customerIdOf('bob@example.com')
      const res = await request(app).patch(`/api/v1/me/profile?id=${bobId}`).set(as('alice')).send({ name: 'Alice Only' })
      expect(res.status).toBe(200)
      expect((await pool.query('SELECT name FROM customers WHERE id=$1', [bobId])).rows[0].name).toBe('Bob Customer')
      expect((await request(app).get(`/api/v1/me/profile/${bobId}`).set(as('alice'))).status).toBe(404)
    })

    it('gives a customer without a linked record 403', async () => {
      await createUser(pool, { email: 'nolink@example.com', role: 'customer', createCustomer: false })
      await loginAs('nolink', 'nolink@example.com')
      expect((await request(app).get('/api/v1/me/profile').set(as('nolink'))).status).toBe(403)
    })
  })

  describe('concurrent edits (last write wins)', () => {
    it('keeps the last write when staff and the customer edit the same record', async () => {
      const id = await customerIdOf('alice@example.com')
      await request(app).patch(`/api/v1/customers/${id}`).set(as('staff')).send({ phone: '+91 10000 00001', company_name: 'Staff Co' })
      await request(app).patch('/api/v1/me/profile').set(as('alice')).send({ phone: '+91 20000 00002' })
      const row = (await pool.query('SELECT phone, company_name FROM customers WHERE id=$1', [id])).rows[0]
      expect(row).toEqual({ phone: '+91 20000 00002', company_name: 'Staff Co' })
    })
  })
})
