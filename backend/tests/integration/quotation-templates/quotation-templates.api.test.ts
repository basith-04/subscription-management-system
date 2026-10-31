import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../src/app.js'
import { createUser } from '../../factories/user.factory.js'
import { getTemplateForUse } from '../../../src/modules/quotation-templates/index.js'

const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)('quotation templates API', () => {
  const schema = `f08_${randomUUID().replaceAll('-', '')}`
  let adminDb: Pool
  let db: Pool
  let app: ReturnType<typeof createApp>
  let admin: ReturnType<typeof request.agent>
  let staff: ReturnType<typeof request.agent>
  const migration = (file: string) => readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), 'utf8')
  const body = { name: 'Standard SaaS yearly', plan_id: 1, validity_days: 30, payment_term_id: 1,
    items: [{ product_id: 1, variant_id: 1, quantity: 2, tax_rule_id: 1 }, { product_id: 2, quantity: 1, unit_price_override: '12.34' }] }

  beforeAll(async () => {
    adminDb = new Pool({ connectionString: url })
    await adminDb.query(`CREATE SCHEMA ${schema}`)
    db = new Pool({ connectionString: url, options: `-c search_path=${schema},public` })
    await db.query(migration('20261031000000_f00_baseline.sql'))
    await db.query(migration('20261101000000_f05_tax_rules_and_payment_terms.sql'))
    await db.query(migration('20261115000000_f06_products_and_variants.sql'))
    // A minimal F07 stand-in keeps the test independent of PG15+ plan uniqueness.
    await db.query("CREATE TABLE plans (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, is_active BOOLEAN NOT NULL, min_quantity INT NOT NULL, available_from DATE NOT NULL DEFAULT '2026-01-01', available_to DATE, billing_frequency TEXT NOT NULL DEFAULT 'yearly', price NUMERIC(12,2) NOT NULL DEFAULT 0)")
    await db.query(migration('20261116000000_f08_quotation_templates.sql'))
    await db.query("INSERT INTO roles (name) VALUES ('admin'), ('staff'), ('customer')")
    await createUser(db, { email: 'admin@example.test', role: 'admin' })
    await createUser(db, { email: 'staff@example.test', role: 'staff' })
    await db.query("INSERT INTO plans (name,is_active,min_quantity) VALUES ('Yearly',true,1)")
    await db.query("INSERT INTO payment_terms (name,due_days) VALUES ('Net 30',30)")
    await db.query("INSERT INTO tax_rules (name,rate) VALUES ('GST',18)")
    await db.query("INSERT INTO products (name,product_type,sales_price) VALUES ('Software','software',1000),('Support','service',100)")
    await db.query("INSERT INTO product_variants (product_id,attribute_name,attribute_value,price_adjustment) VALUES (1,'Brand','Odoo',560)")
    app = createApp(undefined, { pool: db })
    admin = request.agent(app)
    staff = request.agent(app)
    expect((await admin.post('/api/v1/auth/login').send({ email: 'admin@example.test', password: 'Example!Pass123' })).status).toBe(200)
    expect((await staff.post('/api/v1/auth/login').send({ email: 'staff@example.test', password: 'Example!Pass123' })).status).toBe(200)
  })
  afterAll(async () => {
    await db?.end()
    if (adminDb) { await adminDb.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await adminDb.end() }
  })

  it('creates, lists, replaces atomically and deactivates with real sessions', async () => {
    const created = await admin.post('/api/v1/quotation-templates').send(body)
    expect(created.status).toBe(201)
    const id = created.body.data.id as number
    expect(created.body.data.items).toHaveLength(2)
    expect((await staff.get('/api/v1/quotation-templates?q=Standard&is_active=true')).body.data).toHaveLength(1)
    expect((await staff.post('/api/v1/quotation-templates').send(body)).status).toBe(403)
    expect((await staff.patch(`/api/v1/quotation-templates/${id}`).send({ name: 'Forbidden' })).status).toBe(403)
    expect((await staff.delete(`/api/v1/quotation-templates/${id}`)).status).toBe(403)
    const forUse = await getTemplateForUse(id, db)
    expect(forUse.items.map((item) => item.unit_price)).toEqual(['1560.00', '12.34'])
    expect((await admin.post('/api/v1/quotation-templates').send(body)).status).toBe(409)
    const bad = await admin.patch(`/api/v1/quotation-templates/${id}`).send({ items: [{ product_id: 2, quantity: 1 }, { product_id: 999, quantity: 1 }] })
    expect(bad.status).toBe(422)
    expect((await admin.get(`/api/v1/quotation-templates/${id}`)).body.data.items).toHaveLength(2)
    await db.query(`CREATE FUNCTION reject_second_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.product_id=2 THEN RAISE EXCEPTION 'test insert failure' USING ERRCODE='23514'; END IF;
      RETURN NEW; END $$`)
    await db.query('CREATE TRIGGER reject_second BEFORE INSERT ON quotation_template_items FOR EACH ROW EXECUTE FUNCTION reject_second_product()')
    const failure = await admin.patch(`/api/v1/quotation-templates/${id}`).send({ items: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }] })
    expect(failure.status).toBe(422)
    expect((await admin.get(`/api/v1/quotation-templates/${id}`)).body.data.items.map((i: { product_id: number }) => i.product_id)).toEqual([1, 2])
    await db.query('DROP TRIGGER reject_second ON quotation_template_items')
    await db.query('DROP FUNCTION reject_second_product()')
    expect((await admin.patch(`/api/v1/quotation-templates/${id}`).send({ notes: 'Changed' })).body.data.items).toHaveLength(2)
    expect((await admin.patch(`/api/v1/quotation-templates/${id}`).send({ items: [] })).status).toBe(422)
    const replaced = await admin.patch(`/api/v1/quotation-templates/${id}`).send({ items: [{ product_id: 2, quantity: 3 }] })
    expect(replaced.body.data.items).toHaveLength(1)
    expect(replaced.body.data.items[0].sort_order).toBe(0)
    expect((await admin.delete(`/api/v1/quotation-templates/${id}`)).status).toBe(204)
    expect((await admin.get(`/api/v1/quotation-templates/${id}`)).body.data.is_active).toBe(false)
    await expect(getTemplateForUse(id, db)).rejects.toMatchObject({ status: 422 })
    const audit = await db.query("SELECT action FROM audit_logs WHERE entity_type='quotation_template' ORDER BY id")
    expect(audit.rows.map((r) => r.action)).toEqual(['quotation_template.create', 'quotation_template.update', 'quotation_template.update', 'quotation_template.deactivate'])
  })

  it('rejects inactive and invalid references, and use after references deactivate', async () => {
    const endpoint = () => admin.post('/api/v1/quotation-templates')
    expect((await endpoint().send({ ...body, name: 'Missing term', payment_term_id: 300 })).status).toBe(422)
    expect((await endpoint().send({ ...body, name: 'Wrong variant', items: [{ product_id: 2, variant_id: 1, quantity: 1 }] })).status).toBe(422)
    expect((await endpoint().send({ ...body, name: 'Zero', items: [] })).status).toBe(422)
    expect((await endpoint().send({ ...body, name: 'Negative', items: [{ product_id: 1, quantity: -1 }] })).status).toBe(422)
    expect((await endpoint().send({ ...body, name: 'Bad override', items: [{ product_id: 1, quantity: 1, unit_price_override: '-1.00' }] })).status).toBe(422)
    const result = await endpoint().send({ ...body, name: 'Reference lifecycle' })
    expect(result.status).toBe(201)
    await db.query('UPDATE tax_rules SET is_active=false WHERE id=1')
    await expect(getTemplateForUse(result.body.data.id, db)).rejects.toMatchObject({ status: 422 })
    expect((await endpoint().send({ ...body, name: 'Inactive tax' })).status).toBe(422)
    await db.query('UPDATE tax_rules SET is_active=true WHERE id=1')
    await db.query('UPDATE products SET is_active=false WHERE id=1')
    expect((await endpoint().send({ ...body, name: 'Inactive product' })).status).toBe(422)
    await db.query('UPDATE products SET is_active=true WHERE id=1')
    await db.query('UPDATE product_variants SET is_active=false WHERE id=1')
    expect((await endpoint().send({ ...body, name: 'Inactive variant' })).status).toBe(422)
    await db.query('UPDATE product_variants SET is_active=true WHERE id=1')
    await db.query('UPDATE plans SET is_active=false WHERE id=1')
    expect((await endpoint().send({ ...body, name: 'Inactive plan' })).status).toBe(422)
  })
})
