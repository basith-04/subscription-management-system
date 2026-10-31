import type { Express } from 'express'
import { SignJWT } from 'jose'
import type { Pool } from 'pg'
import request from 'supertest'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { seedAdmin, seedStaff } from '../../../db/seed.js'
import { createTestApp } from '../../helpers/app.js'
import {
  canConnect,
  createTestPool,
  prepareDatabase,
  resetData,
  TEST_JWT_SECRET,
} from '../../helpers/db.js'
import { cookiePair, setCookieHeader } from '../../helpers/cookies.js'
import { createUser } from '../../factories/user.factory.js'

const COOKIE_NAME = 'brightloop_session'
const dbAvailable = await canConnect()

if (!dbAvailable) {
  console.warn(
    'skipping auth integration tests: TEST_DATABASE_URL is not reachable',
  )
}

const registration = {
  full_name: 'Example Customer',
  email: 'customer@example.com',
  password: 'Example!Pass123',
  company_name: 'Example Company',
  phone: '+91 9876543210',
}

async function countRows(
  pool: Pool,
  table: 'users' | 'customers' | 'audit_logs',
): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
  )
  return result.rows[0]?.count ?? 0
}

describe.skipIf(!dbAvailable)('F01 auth API', () => {
  let pool: Pool
  let app: Express

  beforeAll(async () => {
    pool = createTestPool()
    await prepareDatabase(pool)
    app = createTestApp(pool)
  })

  beforeEach(async () => {
    await resetData(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('POST /api/v1/auth/register', () => {
    it('creates one user and one linked customer and stores only a hash', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(registration)

      expect(response.status).toBe(201)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.body.data).toMatchObject({
        user: {
          email: 'customer@example.com',
          full_name: 'Example Customer',
          role: 'customer',
        },
        customer_id: expect.any(Number),
      })
      expect(response.body.data.user).not.toHaveProperty('password')
      expect(response.body.data.user).not.toHaveProperty('password_hash')

      const cookie = setCookieHeader(response)
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toMatch(/Max-Age=28800/)
      expect(cookie).not.toContain('Secure')

      expect(await countRows(pool, 'users')).toBe(1)
      expect(await countRows(pool, 'customers')).toBe(1)

      const user = await pool.query<{
        id: string
        password_hash: string
      }>(
        'SELECT id, password_hash FROM users WHERE email = $1',
        ['customer@example.com'],
      )
      const customer = await pool.query<{ user_id: string }>(
        'SELECT user_id FROM customers',
      )

      expect(user.rows[0]?.password_hash).toMatch(/^\$argon2id\$/)
      expect(user.rows[0]?.password_hash).not.toBe(registration.password)
      expect(Number(customer.rows[0]?.user_id)).toBe(
        Number(user.rows[0]?.id),
      )

      const audits = await pool.query(
        'SELECT action, new_values FROM audit_logs',
      )
      expect(audits.rows[0]?.action).toBe('user.register')
      expect(JSON.stringify(audits.rows)).not.toContain(
        registration.password,
      )
      expect(JSON.stringify(audits.rows)).not.toContain('$argon2')
    })

    it('returns 409 for an email that differs only by case and whitespace', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send(registration)

      const duplicate = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...registration,
          email: '  Customer@Example.COM ',
        })

      expect(duplicate.status).toBe(409)
      expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_EXISTS')
      expect(await countRows(pool, 'users')).toBe(1)
      expect(await countRows(pool, 'customers')).toBe(1)
    })

    it('rejects crafted privilege fields with 422', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...registration, role: 'admin', is_active: false })

      expect(response.status).toBe(422)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(await countRows(pool, 'users')).toBe(0)
    })

    it('rejects an exactly 8 character password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...registration, password: 'Abcde!1x' })

      expect(response.status).toBe(422)
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ]),
      )
    })

    it('allows exactly one of two concurrent registrations with the same email', async () => {
      const responses = await Promise.all([
        request(app)
          .post('/api/v1/auth/register')
          .send(registration),
        request(app)
          .post('/api/v1/auth/register')
          .send({ ...registration }),
      ])

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ])
      expect(await countRows(pool, 'users')).toBe(1)
      expect(await countRows(pool, 'customers')).toBe(1)
    })

    it('rolls back the user when the customer insert fails', async () => {
      await pool.query(`
        CREATE OR REPLACE FUNCTION test_fail_customer_insert()
        RETURNS trigger AS $$
        BEGIN
          IF NEW.name = 'Rollback Test' THEN
            RAISE EXCEPTION 'forced customer failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER test_fail_customer_insert
        BEFORE INSERT ON customers
        FOR EACH ROW EXECUTE FUNCTION test_fail_customer_insert();
      `)

      try {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({ ...registration, full_name: 'Rollback Test' })

        expect(response.status).toBe(500)
        expect(await countRows(pool, 'users')).toBe(0)
        expect(await countRows(pool, 'customers')).toBe(0)
      } finally {
        await pool.query(`
          DROP TRIGGER IF EXISTS test_fail_customer_insert ON customers;
          DROP FUNCTION IF EXISTS test_fail_customer_insert();
        `)
      }
    })

    it('rejects a disallowed browser origin', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', 'https://evil.example')
        .send(registration)

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('FORBIDDEN')
      expect(await countRows(pool, 'users')).toBe(0)
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('sets a cookie, returns the safe user and updates last_login_at', async () => {
      const user = await createUser(pool, {
        email: 'login@example.com',
      })

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: ' Login@Example.com ', password: 'Example!Pass123' })

      expect(response.status).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.body.data).toMatchObject({
        id: user.id,
        email: 'login@example.com',
        role: 'customer',
        customer_id: user.customer_id,
      })
      expect(response.body.data).not.toHaveProperty('password_hash')
      expect(setCookieHeader(response)).toContain(COOKIE_NAME)

      const row = await pool.query<{ last_login_at: Date | null }>(
        'SELECT last_login_at FROM users WHERE id = $1',
        [user.id],
      )
      expect(row.rows[0]?.last_login_at).not.toBeNull()
    })

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      await createUser(pool, { email: 'known@example.com' })

      const wrongPassword = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'known@example.com', password: 'Wrong!Pass123' })
      const unknownEmail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@example.com', password: 'Wrong!Pass123' })

      expect(wrongPassword.status).toBe(401)
      expect(unknownEmail.status).toBe(401)
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(unknownEmail.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: wrongPassword.body.error.message,
      })

      const row = await pool.query<{ last_login_at: Date | null }>(
        "SELECT last_login_at FROM users WHERE email = 'known@example.com'",
      )
      expect(row.rows[0]?.last_login_at).toBeNull()
    })

    it('rejects an inactive account with 403', async () => {
      await createUser(pool, {
        email: 'disabled@example.com',
        isActive: false,
      })

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'disabled@example.com', password: 'Example!Pass123' })

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('FORBIDDEN')
    })

    it('allows staff and admin accounts to log in with their role', async () => {
      await createUser(pool, { email: 'staff@example.com', role: 'staff' })
      await createUser(pool, { email: 'admin@example.com', role: 'admin' })

      const staff = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'staff@example.com', password: 'Example!Pass123' })
      const admin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'Example!Pass123' })

      expect(staff.body.data.role).toBe('staff')
      expect(admin.body.data.role).toBe('admin')
      expect(staff.body.data.customer_id).toBeNull()
      expect(admin.body.data.customer_id).toBeNull()
    })

    it('allows the seeded first admin to log in', async () => {
      const created = await seedAdmin(pool, {
        ADMIN_EMAIL: 'seeded-admin@example.com',
        ADMIN_PASSWORD: 'Seeded!Pass123',
        ADMIN_FULL_NAME: 'Seeded Admin',
      } as NodeJS.ProcessEnv)
      expect(created).toBe(true)

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'seeded-admin@example.com',
          password: 'Seeded!Pass123',
        })

      expect(response.status).toBe(200)
      expect(response.body.data.role).toBe('admin')
    })

    it('allows an environment-seeded staff account to log in without overwriting it', async () => {
      const env = { STAFF_EMAIL: 'seeded-staff@example.com', STAFF_PASSWORD: 'Seeded!Pass123', STAFF_FULL_NAME: 'Seeded Staff' } as NodeJS.ProcessEnv
      expect(await seedStaff(pool, env)).toBe(true)
      expect(await seedStaff(pool, env)).toBe(false)
      const response = await request(app).post('/api/v1/auth/login').send({ email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD })
      expect(response.status).toBe(200)
      expect(response.body.data.role).toBe('staff')
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns the current user with a valid session cookie', async () => {
      const agent = request.agent(app)
      const registered = await agent
        .post('/api/v1/auth/register')
        .send(registration)

      const response = await agent.get('/api/v1/auth/me')

      expect(response.status).toBe(200)
      expect(response.body.data).toMatchObject({
        id: registered.body.data.user.id,
        email: 'customer@example.com',
        full_name: 'Example Customer',
        role: 'customer',
        customer_id: registered.body.data.customer_id,
      })
    })

    it('returns 401 without a cookie', async () => {
      const response = await request(app).get('/api/v1/auth/me')

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('rejects a tampered cookie', async () => {
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .send(registration)
      const pair = cookiePair(registered)
      const [name, value = ''] = pair.split('=')
      const [header, payload, signature = ''] = value.split('.')
      // Change a significant signature character, not unused base64url pad bits.
      const changedSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`
      const tampered = `${name}=${header}.${payload}.${changedSignature}`

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', tampered)

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('rejects an expired cookie', async () => {
      const user = await createUser(pool, { email: 'expired@example.com' })
      const token = await new SignJWT({ role: 'customer' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(user.id))
        .setIssuedAt(1_000)
        .setExpirationTime(2_000)
        .sign(new TextEncoder().encode(TEST_JWT_SECRET))

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${token}`)

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('rejects a cookie whose user was deleted', async () => {
      const agent = request.agent(app)
      await agent.post('/api/v1/auth/register').send(registration)
      await pool.query("DELETE FROM users WHERE email = 'customer@example.com'")

      const response = await agent.get('/api/v1/auth/me')

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('rejects a cookie whose user was deactivated', async () => {
      const agent = request.agent(app)
      await agent.post('/api/v1/auth/register').send(registration)
      await pool.query(
        "UPDATE users SET is_active = false WHERE email = 'customer@example.com'",
      )

      const response = await agent.get('/api/v1/auth/me')

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 403 for a customer without a linked profile', async () => {
      await createUser(pool, {
        email: 'no-profile@example.com',
        createCustomer: false,
      })
      const agent = request.agent(app)
      await agent
        .post('/api/v1/auth/login')
        .send({ email: 'no-profile@example.com', password: 'Example!Pass123' })

      const response = await agent.get('/api/v1/auth/me')

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('FORBIDDEN')
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('clears the cookie with matching attributes and ends the session', async () => {
      const agent = request.agent(app)
      await agent.post('/api/v1/auth/register').send(registration)

      const logout = await agent.post('/api/v1/auth/logout')

      expect(logout.status).toBe(204)
      const cookie = setCookieHeader(logout)
      expect(cookie).toContain(`${COOKIE_NAME}=;`)
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/)

      const me = await agent.get('/api/v1/auth/me')
      expect(me.status).toBe(401)
    })
  })

  describe('security controls', () => {
    it('returns 429 after the configured login limit, including casing changes', async () => {
      const limitedApp = createTestApp(pool, {
        RATE_LIMIT_MAX: '2',
        RATE_LIMIT_WINDOW_MS: '60000',
      })
      const attempt = (email: string) =>
        request(limitedApp)
          .post('/api/v1/auth/login')
          .send({ email, password: 'Wrong!Pass123' })

      expect((await attempt('rate@example.com')).status).toBe(401)
      expect((await attempt(' RATE@example.com ')).status).toBe(401)

      const limited = await attempt('rate@example.com')
      expect(limited.status).toBe(429)
      expect(limited.body.error.code).toBe('RATE_LIMITED')
      expect(limited.headers['retry-after']).toBeTypeOf('string')

      // An IP-wide limit also prevents bypass by changing email addresses.
      expect((await attempt('other@example.com')).status).toBe(429)
    })

    it('limits attempts across different emails from the same IP', async () => {
      const limitedApp = createTestApp(pool, { RATE_LIMIT_MAX: '2' })
      const attempt = (email: string) => request(limitedApp)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong!Pass123' })

      expect((await attempt('one@example.com')).status).toBe(401)
      expect((await attempt('two@example.com')).status).toBe(401)
      expect((await attempt('three@example.com')).status).toBe(429)
    })

    it('marks the cookie Secure in production', async () => {
      const productionApp = createTestApp(pool, {
        APP_ENV: 'production',
        COOKIE_SECURE: 'true',
        ALLOWED_ORIGINS: 'http://localhost:8080',
      })

      const response = await request(productionApp)
        .post('/api/v1/auth/register')
        .send(registration)

      expect(response.status).toBe(201)
      const cookie = setCookieHeader(response)
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toMatch(/Max-Age=28800/)
    })
  })
})
