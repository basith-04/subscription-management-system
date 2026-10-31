import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../src/app.js'
import { createUser } from '../../factories/user.factory.js'

const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)('F05 PostgreSQL reference data', () => {
  const schema = `f05_${randomUUID().replaceAll('-', '')}`
  let root: Pool
  let db: Pool
  let app: ReturnType<typeof createApp>
  let admin: ReturnType<typeof request.agent>
  let staff: ReturnType<typeof request.agent>
  let customer: ReturnType<typeof request.agent>
  const sql = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8')
  beforeAll(async () => {
    root = new Pool({ connectionString: url })
    await root.query(`CREATE SCHEMA ${schema}`)
    db = new Pool({ connectionString: url, options: `-c search_path=${schema},public` })
    await db.query(sql('20261031000000_f00_baseline.sql'))
    await db.query(sql('20261101000000_f05_tax_rules_and_payment_terms.sql'))
    await db.query("INSERT INTO roles (name) VALUES ('admin'), ('staff'), ('customer')")
    for (const role of ['admin', 'staff', 'customer'] as const) await createUser(db, { email: `${role}@f05.example.test`, role })
    app = createApp(undefined, { pool: db })
    admin = request.agent(app); staff = request.agent(app); customer = request.agent(app)
    for (const [agent, role] of [[admin, 'admin'], [staff, 'staff'], [customer, 'customer']] as const) {
      expect((await agent.post('/api/v1/auth/login').send({ email: `${role}@f05.example.test`, password: 'Example!Pass123' })).status).toBe(200)
    }
  })
  afterAll(async () => {
    await db?.end()
    if (root) { await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end() }
  })
  it('requires real sessions and enforces the Admin/Staff/Customer matrix', async () => {
    for (const path of ['/api/v1/taxes', '/api/v1/payment-terms']) {
      expect((await request(app).get(path)).status).toBe(401)
      expect((await request(app).get(path).set('x-user-role', 'admin')).status).toBe(401)
      expect((await customer.get(path)).status).toBe(403)
      expect((await staff.get(path)).status).toBe(200)
      expect((await admin.get(path)).status).toBe(200)
      expect((await staff.post(path).send({ name: 'Denied', rate: '10', due_days: 10 })).status).toBe(403)
      expect((await staff.patch(`${path}/1`).send({ is_active: false })).status).toBe(403)
    }
    expect((await staff.delete('/api/v1/taxes/1')).status).toBe(403)
    expect((await admin.delete('/api/v1/payment-terms/1')).status).toBe(404)
  })
  it('persists, filters, updates and audits tax rules and terms in PostgreSQL', async () => {
    const tax = await admin.post('/api/v1/taxes').send({ name: 'Audit GST', rate: '7.5' })
    const term = await admin.post('/api/v1/payment-terms').send({ name: 'Audit Net 45', due_days: 45 })
    expect(tax.status).toBe(201); expect(tax.body.data.rate).toBe('7.500')
    expect(term.status).toBe(201); expect(term.body.data.due_days).toBe(45)
    expect((await db.query('SELECT rate::text FROM tax_rules WHERE id=$1', [tax.body.data.id])).rows[0].rate).toBe('7.500')
    expect((await db.query('SELECT due_days FROM payment_terms WHERE id=$1', [term.body.data.id])).rows[0].due_days).toBe(45)
    expect((await admin.patch(`/api/v1/taxes/${tax.body.data.id}`).send({ rate: '8.000', is_active: false })).body.data.rate).toBe('8.000')
    expect((await admin.patch(`/api/v1/payment-terms/${term.body.data.id}`).send({ due_days: 46, is_active: false })).body.data.due_days).toBe(46)
    expect((await staff.get('/api/v1/taxes?is_active=false')).body.data.some((x: { id: string }) => x.id === tax.body.data.id)).toBe(true)
    expect((await staff.get('/api/v1/payment-terms?is_active=true')).body.data.some((x: { id: string }) => x.id === term.body.data.id)).toBe(false)
    const audit = await db.query("SELECT action FROM audit_logs WHERE action IN ('tax.create','tax.deactivate','payment_term.create','payment_term.deactivate')")
    expect(audit.rows.map((r) => r.action).sort()).toEqual(['payment_term.create', 'payment_term.deactivate', 'tax.create', 'tax.deactivate'])
    const freshApp = createApp(undefined, { pool: db })
    const login = request.agent(freshApp)
    await login.post('/api/v1/auth/login').send({ email: 'admin@f05.example.test', password: 'Example!Pass123' })
    expect((await login.get(`/api/v1/taxes/${tax.body.data.id}`)).body.data.rate).toBe('8.000')
  })
  it('rejects duplicates including concurrent case variants and invalid inputs', async () => {
    const taxes = await Promise.all(['Same tax', 'same tax'].map((name) => admin.post('/api/v1/taxes').send({ name, rate: '18' })))
    expect(taxes.map((r) => r.status).sort()).toEqual([201, 409])
    const terms = await Promise.all(['Same term', 'same term'].map((name) => admin.post('/api/v1/payment-terms').send({ name, due_days: 30 })))
    expect(terms.map((r) => r.status).sort()).toEqual([201, 409])
    expect((await admin.post('/api/v1/taxes').send({ name: 'Invalid', rate: '-1' })).status).toBe(422)
    expect((await admin.post('/api/v1/payment-terms').send({ name: 'Invalid', due_days: -1 })).status).toBe(422)
    expect((await admin.patch('/api/v1/taxes/not-a-number').send({ rate: '1' })).status).toBe(422)
  })
  it('returns IN_USE for referenced tax and deletes unused tax', async () => {
    const tax = await admin.post('/api/v1/taxes').send({ name: 'Referenced', rate: '5' })
    await db.query('CREATE TABLE tax_reference (tax_id BIGINT REFERENCES tax_rules(id))')
    await db.query('INSERT INTO tax_reference(tax_id) VALUES ($1)', [tax.body.data.id])
    const used = await admin.delete(`/api/v1/taxes/${tax.body.data.id}`)
    expect(used.status).toBe(409); expect(used.body.error.code).toBe('IN_USE')
    const unused = await admin.post('/api/v1/taxes').send({ name: 'Unused', rate: '5' })
    expect((await admin.delete(`/api/v1/taxes/${unused.body.data.id}`)).status).toBe(204)
    expect((await admin.get(`/api/v1/taxes/${unused.body.data.id}`)).status).toBe(404)
  })
  it('rolls back the mutation when its audit insert fails', async () => {
    await db.query(`CREATE FUNCTION fail_tax_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='tax.create' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`)
    await db.query('CREATE TRIGGER fail_tax_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_tax_audit()')
    const result = await admin.post('/api/v1/taxes').send({ name: 'Audit failure rollback', rate: '5' })
    expect(result.status).toBe(500)
    expect((await db.query("SELECT count(*)::int AS n FROM tax_rules WHERE name='Audit failure rollback'")).rows[0].n).toBe(0)
    await db.query('DROP TRIGGER fail_tax_audit ON audit_logs')
    await db.query('DROP FUNCTION fail_tax_audit()')
  })
})
