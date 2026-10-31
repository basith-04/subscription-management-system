// F09 API + schema tests. REAL migrations (F00/F05/F06/F07/F09/F11/F13) in an isolated schema; catalogue rows come from
// factories; only F08's template tables are test stand-ins (see subscriptions-test-db.ts).
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlan, createProduct, createTaxRule, createTemplate, createVariant, firstPaymentTerm } from '../../factories/catalogue.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createSubscriptionTestDb, type SubscriptionTestDb } from '../../helpers/subscriptions-test-db.js'
import { todayInAppTimezone } from '../../../src/lib/dates.js'

const dbAvailable = await canConnect()
const PASSWORD = 'Example!Pass123'
const shift = (days: number) => {
  const d = new Date(`${todayInAppTimezone()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}

describe.skipIf(!dbAvailable)('F09 quotations and subscriptions API', () => {
  let fixture: SubscriptionTestDb
  let pool: Pool
  let app: Express
  const cookies: Record<string, string> = {}
  let customerId: number, otherCustomerId: number, planId: number, productId: number, variantId: number, taxId: number, termId: number
  const as = (k: string) => ({ Cookie: cookies[k] ?? '' })
  const login = async (key: string, email: string) => {
    const r = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })
    expect(r.status).toBe(200); cookies[key] = cookiePair(r)
  }
  const body = (over: Record<string, unknown> = {}) => ({
    customer_id: customerId, plan_id: planId, start_date: shift(5), expiry_date: shift(370), payment_term_id: termId,
    items: [{ product_id: productId, variant_id: variantId, quantity: 5, tax_rule_id: taxId }], ...over })
  const mk = async (over: Record<string, unknown> = {}, who = 'staff') => {
    const r = await request(app).post('/api/v1/quotations').set(as(who)).send(body(over))
    expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data
  }
  const issued = async (over: Record<string, unknown> = {}) => {
    const q = await mk(over)
    const r = await request(app).post(`/api/v1/quotations/${q.id}/issue`).set(as('staff')).send({ valid_until: shift(10) })
    expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data
  }
  const status = async (id: number) => (await pool.query('SELECT status FROM subscriptions WHERE id=$1', [id])).rows[0].status
  const audit = async (id: number) => (await pool.query<{ action: string }>("SELECT action FROM audit_logs WHERE entity_type='subscription' AND entity_id=$1 ORDER BY id", [id])).rows.map((r) => r.action)

  beforeAll(async () => { fixture = await createSubscriptionTestDb(); pool = fixture.pool; app = createTestApp(pool) })
  afterAll(async () => { await fixture.teardown() })
  beforeEach(async () => {
    await fixture.reset()
    await pool.query("DELETE FROM tax_rules WHERE name LIKE 'Test %'")
    await createUser(pool, { email: 'admin@example.com', role: 'admin' })
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    customerId = (await createUser(pool, { email: 'alice@example.com', role: 'customer', fullName: 'Alice Customer' })).customer_id!
    otherCustomerId = (await createUser(pool, { email: 'bob@example.com', role: 'customer', fullName: 'Bob Other' })).customer_id!
    productId = await createProduct(pool, { name: 'Platform', sales_price: '1000.00' })
    variantId = await createVariant(pool, productId, { attribute_name: 'Brand', attribute_value: 'Odoo', price_adjustment: '560.00' })
    taxId = await createTaxRule(pool, { name: 'Test GST 18%', rate: '18.000' })
    planId = await createPlan(pool, { min_quantity: 2 })
    termId = await firstPaymentTerm(pool)
    for (const [k, e] of [['admin', 'admin@example.com'], ['staff', 'staff@example.com'], ['alice', 'alice@example.com'], ['bob', 'bob@example.com']]) await login(k!, e!)
  })

  describe('schema (real migrations)', () => {
    it('has the documented tables, sequence, indexes and constraints', async () => {
      const idx = (await pool.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='subscriptions'`, [fixture.schema])).rows.map((r) => r.indexname)
      for (const n of ['uq_subscriptions_number', 'ix_subscriptions_next_billing', 'ix_subscriptions_customer_status', 'ix_subscriptions_status_expiry', 'ix_subscriptions_plan']) expect(idx).toContain(n)
      const partial = (await pool.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='ix_subscriptions_next_billing'`, [fixture.schema])).rows[0]!.indexdef
      expect(partial).toMatch(/WHERE .*status = 'active'.*paused_at IS NULL/)
      expect((await pool.query(`SELECT 1 FROM pg_sequences WHERE schemaname=$1 AND sequencename='subscription_number_seq'`, [fixture.schema])).rowCount).toBe(1)
      const fks = (await pool.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE connamespace=$1::regnamespace AND contype='f'`, [fixture.schema])).rows.map((r) => r.conname)
      expect(fks).toEqual(expect.arrayContaining(['fk_subscriptions_template_id', 'fk_invoices_subscription_id']))
    })
    it('enforces the documented CHECKs in the database', async () => {
      const id = (await mk()).id
      const fail = (sql: string, re: RegExp) => expect(pool.query(sql, [id])).rejects.toThrow(re)
      await fail("UPDATE subscriptions SET status='closed' WHERE id=$1", /ck_subscriptions_closed_at/)
      await fail("UPDATE subscriptions SET paused_at=now() WHERE id=$1", /ck_subscriptions_paused_active/)
      await fail("UPDATE subscriptions SET next_billing_date=CURRENT_DATE WHERE id=$1", /ck_subscriptions_next_billing_active/)
      await fail("UPDATE subscriptions SET expiry_date = start_date - 1 WHERE id=$1", /ck_subscriptions_expiry/)
      await fail("UPDATE subscriptions SET status='paused' WHERE id=$1", /subscriptions_status_check/)
      await fail("UPDATE subscriptions SET status='closed', closed_at=now(), closed_reason='bogus' WHERE id=$1", /closed_reason_check/)
      await expect(pool.query('UPDATE subscription_items SET quantity=0 WHERE subscription_id=$1', [id])).rejects.toThrow(/quantity_check/)
      await expect(pool.query('UPDATE subscription_items SET line_amount=1 WHERE subscription_id=$1', [id])).rejects.toThrow(/can only be updated to DEFAULT|generated/i)
    })
    it('restricts deleting a customer or plan that has subscriptions and cascades items', async () => {
      const id = (await mk()).id
      await expect(pool.query('DELETE FROM customers WHERE id=$1', [customerId])).rejects.toThrow(/foreign key/)
      await expect(pool.query('DELETE FROM plans WHERE id=$1', [planId])).rejects.toThrow(/foreign key/)
      await pool.query('DELETE FROM subscriptions WHERE id=$1', [id])
      expect((await pool.query('SELECT 1 FROM subscription_items')).rowCount).toBe(0)
    })
  })

  describe('create', () => {
    it('creates a draft with a SUB-000001 number, snapshotted lines and estimated totals', async () => {
      const q = await mk()
      expect(q).toMatchObject({
        number: 'SUB-000001', status: 'draft', display_status: 'Draft', customer: { id: customerId, name: 'Alice Customer' },
        plan: { id: planId }, payment_term: { id: termId }, can_edit: true, can_issue: true, can_confirm: false, can_cancel: true,
        totals: { subtotal: '7800.00', estimated_tax: '1404.00', total: '9204.00' },
      })
      expect(q.items).toEqual([expect.objectContaining({
        description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', line_amount: '7800.00', tax_amount: '1404.00', line_total: '9204.00',
        tax_rule: { id: taxId, name: 'Test GST 18%', rate: '18.000' },
      })])
      expect(await audit(q.id)).toEqual(['subscription.create'])
      expect((await request(app).post('/api/v1/subscriptions').set(as('admin')).send(body())).body.data.number).toBe('SUB-000002')
    })
    it('line price override wins; 33.33 × 5% rounds to 1.67 per line', async () => {
      const q = await mk({ items: [{ product_id: productId, quantity: 2, unit_price: '33.33', tax_rule_id: await createTaxRule(pool, { rate: '5.000' }) }] })
      expect(q.items[0]).toMatchObject({ unit_price: '33.33', line_amount: '66.66', tax_amount: '3.33' })
      const one = await mk({ plan_id: await createPlan(pool, { min_quantity: 1 }), items: [{ product_id: productId, quantity: 1, unit_price: '33.33', tax_rule_id: await createTaxRule(pool, { rate: '5.000' }) }] })
      expect(one.items[0].tax_amount).toBe('1.67')
    })
    it('price snapshot: a later catalogue price change does not change the subscription line', async () => {
      const q = await mk()
      await pool.query("UPDATE products SET sales_price='9999.00' WHERE id=$1", [productId])
      await pool.query("UPDATE product_variants SET price_adjustment='1.00' WHERE id=$1", [variantId])
      await pool.query("UPDATE products SET name='Renamed' WHERE id=$1", [productId])
      const d = (await request(app).get(`/api/v1/subscriptions/${q.id}`).set(as('staff'))).body.data
      expect(d.items[0]).toMatchObject({ unit_price: '1560.00', description: 'Platform – Brand: Odoo' })
      expect(d.totals.total).toBe('9204.00')
    })
    it('creates from a template: copies lines (template override beats catalogue), sets plan and term; later template edits do not matter', async () => {
      const tplPlan = await createPlan(pool, { min_quantity: 1 })
      const tpl = await createTemplate(pool, { planId: tplPlan, validity_days: 14, items: [
        { product_id: productId, variant_id: variantId, quantity: 3, tax_rule_id: taxId },
        { product_id: await createProduct(pool, { sales_price: '10.00' }), quantity: 1, unit_price_override: '7.50' },
      ] })
      const r = await request(app).post('/api/v1/quotations').set(as('staff')).send({ customer_id: customerId, template_id: tpl, start_date: shift(1), expiry_date: shift(300) })
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data).toMatchObject({ template_id: tpl, plan: { id: tplPlan }, payment_term: { id: termId } })
      expect(r.body.data.items.map((i: any) => [i.quantity, i.unit_price])).toEqual([[3, '1560.00'], [1, '7.50']])
      await pool.query('UPDATE quotation_template_items SET quantity = 99, unit_price_override = 1')
      expect((await request(app).get(`/api/v1/quotations/${r.body.data.id}`).set(as('staff'))).body.data.items.map((i: any) => i.quantity)).toEqual([3, 1])
      // template + explicit items: explicit items win
      const own = await request(app).post('/api/v1/quotations').set(as('staff')).send({ customer_id: customerId, template_id: tpl, plan_id: tplPlan, start_date: shift(1), expiry_date: shift(300), items: [{ product_id: productId, quantity: 4 }] })
      expect(own.status, JSON.stringify(own.body)).toBe(201)
      expect(own.body.data.items.map((i: any) => i.quantity)).toEqual([4])
    })
    it('template errors: plan mismatch, inactive, missing, and unavailable F08 tables are 422', async () => {
      const p2 = await createPlan(pool, { min_quantity: 1 })
      const tpl = await createTemplate(pool, { planId: p2, items: [{ product_id: productId, quantity: 1 }] })
      const base = { customer_id: customerId, start_date: shift(1), expiry_date: shift(30) }
      const mismatch = await request(app).post('/api/v1/quotations').set(as('staff')).send({ ...base, template_id: tpl, plan_id: planId })
      expect(mismatch.status).toBe(422); expect(mismatch.body.error.details[0].field).toBe('plan_id')
      await pool.query('UPDATE quotation_templates SET is_active=false WHERE id=$1', [tpl])
      expect((await request(app).post('/api/v1/quotations').set(as('staff')).send({ ...base, template_id: tpl })).status).toBe(422)
      expect((await request(app).post('/api/v1/quotations').set(as('staff')).send({ ...base, template_id: 9999 })).body.error.details[0].field).toBe('template_id')
    })
    it('rejects invalid plan, quantities, references and dates with documented codes', async () => {
      const post = (over: Record<string, unknown>, who = 'staff') => request(app).post('/api/v1/quotations').set(as(who)).send(body(over))
      const min = await post({ items: [{ product_id: productId, quantity: 1 }] })
      expect(min.status).toBe(422); expect(min.body.error.code).toBe('QUANTITY_BELOW_MINIMUM')
      expect((await post({ plan_id: await createPlan(pool, { is_active: false }) })).body.error.code).toBe('PLAN_NOT_AVAILABLE')
      expect((await post({ plan_id: await createPlan(pool, { available_from: shift(100) }) })).body.error.code).toBe('PLAN_NOT_AVAILABLE')
      expect((await post({ plan_id: await createPlan(pool, { available_to: shift(1) }) })).body.error.code).toBe('PLAN_NOT_AVAILABLE')
      expect((await post({ plan_id: await createPlan(pool, { available_from: shift(5), available_to: shift(5) }) })).status).toBe(201) // inclusive bounds
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['missing customer', { customer_id: 99999 }, 'customer_id'], ['missing plan', { plan_id: 99999 }, 'plan_id'],
        ['missing term', { payment_term_id: 9999 }, 'payment_term_id'],
        ['missing product', { items: [{ product_id: 99999, quantity: 2 }] }, 'items.0.product_id'],
        ['inactive product', { items: [{ product_id: await createProduct(pool, { is_active: false }), quantity: 2 }] }, 'items.0.product_id'],
        ['foreign variant', { items: [{ product_id: await createProduct(pool), variant_id: variantId, quantity: 2 }] }, 'items.0.variant_id'],
        ['inactive tax', { items: [{ product_id: productId, quantity: 2, tax_rule_id: await createTaxRule(pool, { is_active: false }) }] }, 'items.0.tax_rule_id'],
      ]
      for (const [name, over, field] of cases) {
        const r = await post(over)
        expect(r.status, name).toBe(422); expect(r.body.error.details.map((d: any) => d.field), name).toContain(field)
      }
      for (const over of [{ expiry_date: shift(1) }, { start_date: 'nope' }, { plan_id: undefined }, { unknown: 1 }, { items: [{ product_id: productId, quantity: 2.5 }] }]) {
        expect((await post(over as never)).status, JSON.stringify(over)).toBe(422)
      }
      const inactiveCustomer = await createUser(pool, { email: 'gone@example.com', role: 'customer' })
      await pool.query('UPDATE customers SET is_active=false WHERE id=$1', [inactiveCustomer.customer_id])
      expect((await post({ customer_id: inactiveCustomer.customer_id })).status).toBe(422)
      expect((await pool.query('SELECT count(*)::int AS n FROM subscriptions WHERE customer_id=$1', [inactiveCustomer.customer_id])).rows[0].n).toBe(0)
    })
    it('D-18: Staff cannot backdate the start, Admin can', async () => {
      const staff = await request(app).post('/api/v1/quotations').set(as('staff')).send(body({ start_date: shift(-3) }))
      expect(staff.status).toBe(422); expect(staff.body.error.details[0].field).toBe('start_date')
      expect((await request(app).post('/api/v1/quotations').set(as('admin')).send(body({ start_date: shift(-3) }))).status).toBe(201)
      expect((await request(app).post('/api/v1/quotations').set(as('staff')).send(body({ start_date: shift(0) }))).status).toBe(201) // today is allowed
    })
    it('maps money overflow to 422 (never a raw 500) and rolls back everything', async () => {
      const r = await request(app).post('/api/v1/quotations').set(as('staff')).send(body({ plan_id: await createPlan(pool, { min_quantity: 1 }), items: [
        { product_id: productId, quantity: 2, unit_price: '9999999999.99' }] }))
      expect(r.status).toBe(422)
      expect((await pool.query('SELECT 1 FROM subscriptions')).rowCount).toBe(0)
      expect((await pool.query('SELECT 1 FROM subscription_items')).rowCount).toBe(0)
    })
    it('rolls back the whole creation when a later line is invalid (no orphan subscription)', async () => {
      const r = await request(app).post('/api/v1/quotations').set(as('staff')).send(body({ items: [{ product_id: productId, quantity: 5 }, { product_id: 99999, quantity: 5 }] }))
      expect(r.status).toBe(422)
      expect((await pool.query('SELECT 1 FROM subscriptions')).rowCount).toBe(0)
    })
    it('parallel creations get unique, sequential-style numbers', async () => {
      const rs = await Promise.all(Array.from({ length: 8 }, () => request(app).post('/api/v1/quotations').set(as('staff')).send(body())))
      expect(rs.every((r) => r.status === 201)).toBe(true)
      const nums = rs.map((r) => r.body.data.number).sort()
      expect(new Set(nums).size).toBe(8)
      expect(nums[0]).toMatch(/^SUB-\d{6}$/)
    })
  })

  describe('update (draft / quotation only)', () => {
    it('replaces lines, edits the header, re-validates the plan and audits', async () => {
      const q = await mk()
      const r = await request(app).patch(`/api/v1/quotations/${q.id}`).set(as('staff')).send({
        expiry_date: shift(400), items: [{ product_id: productId, quantity: 3, unit_price: '100.00' }, { product_id: productId, variant_id: variantId, quantity: 2 }] })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.items.map((i: any) => [i.quantity, i.unit_price])).toEqual([[3, '100.00'], [2, '1560.00']])
      expect(r.body.data.expiry_date).toBe(shift(400))
      expect(await audit(q.id)).toEqual(['subscription.create', 'subscription.update'])
      const below = await request(app).patch(`/api/v1/quotations/${q.id}`).set(as('staff')).send({ items: [{ product_id: productId, quantity: 1 }] })
      expect(below.body.error.code).toBe('QUANTITY_BELOW_MINIMUM')
      expect((await request(app).get(`/api/v1/quotations/${q.id}`).set(as('staff'))).body.data.items).toHaveLength(2) // unchanged
    })
    it('changing the plan re-checks the existing lines against the new minimum', async () => {
      const q = await mk()
      const strict = await createPlan(pool, { min_quantity: 50 })
      const r = await request(app).patch(`/api/v1/quotations/${q.id}`).set(as('staff')).send({ plan_id: strict })
      expect(r.status).toBe(422); expect(r.body.error.code).toBe('QUANTITY_BELOW_MINIMUM')
    })
    it('is editable while issued, but 409 once confirmed or closed; empty patches are 422', async () => {
      const q = await issued()
      expect((await request(app).patch(`/api/v1/quotations/${q.id}`).set(as('staff')).send({ expiry_date: shift(500) })).status).toBe(200)
      await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))
      const locked = await request(app).patch(`/api/v1/subscriptions/${q.id}`).set(as('staff')).send({ expiry_date: shift(600) })
      expect(locked.status).toBe(409); expect(locked.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect((await request(app).patch(`/api/v1/quotations/${q.id}`).set(as('staff')).send({})).status).toBe(422)
      expect((await request(app).patch('/api/v1/quotations/99999').set(as('staff')).send({ expiry_date: shift(1) })).status).toBe(404)
    })
  })

  describe('lifecycle: issue → confirm → cancel', () => {
    it('draft → quotation → confirmed with audit history, timestamps and the shared transition helper', async () => {
      const q = await mk()
      const i = await request(app).post(`/api/v1/quotations/${q.id}/issue`).set(as('staff')).send({ valid_until: shift(7) })
      expect(i.body.data).toMatchObject({ status: 'quotation', quotation_valid_until: shift(7), can_confirm: true, can_issue: false })
      const c = await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))
      expect(c.status).toBe(200); expect(c.body.data).toMatchObject({ status: 'confirmed', display_status: 'Confirmed', can_edit: false, can_cancel: true })
      expect(c.body.data.confirmed_at).toEqual(expect.any(String))
      expect(await audit(q.id)).toEqual(['subscription.create', 'subscription.issue', 'subscription.confirm'])
      const h = (await request(app).get(`/api/v1/subscriptions/${q.id}/history`).set(as('staff'))).body.data
      expect(h.map((e: any) => e.action)).toEqual(['subscription.create', 'subscription.issue', 'subscription.confirm'])
      expect(h[1]).toMatchObject({ old_values: { status: 'draft' }, new_values: { status: 'quotation' }, actor: { name: 'Test User' } })
      // appears in the subscription list
      const l = await request(app).get('/api/v1/subscriptions?status=confirmed').set(as('staff'))
      expect(l.body.data.map((s: any) => s.id)).toEqual([q.id])
    })
    it('issue needs ≥ 1 line and a non-past validity; template validity_days is the default', async () => {
      const empty = await mk({ items: [] })
      const r = await request(app).post(`/api/v1/quotations/${empty.id}/issue`).set(as('staff')).send({ valid_until: shift(5) })
      expect(r.status).toBe(422); expect(r.body.error.details[0].field).toBe('items')
      const q = await mk()
      expect((await request(app).post(`/api/v1/quotations/${q.id}/issue`).set(as('staff')).send({})).body.error.details[0].field).toBe('valid_until')
      expect((await request(app).post(`/api/v1/quotations/${q.id}/issue`).set(as('staff')).send({ valid_until: shift(-1) })).status).toBe(422)
      expect(await status(q.id)).toBe('draft')
      const tplPlan = await createPlan(pool, { min_quantity: 1 })
      const tpl = await createTemplate(pool, { planId: tplPlan, validity_days: 21, items: [{ product_id: productId, quantity: 1 }] })
      const t = (await request(app).post('/api/v1/quotations').set(as('staff')).send({ customer_id: customerId, template_id: tpl, start_date: shift(1), expiry_date: shift(100) })).body.data
      const issuedT = await request(app).post(`/api/v1/quotations/${t.id}/issue`).set(as('staff')).send({})
      expect(issuedT.body.data.quotation_valid_until).toBe(shift(21))
    })
    it('confirm is inclusive on the validity date and expired quotations are 409 QUOTATION_EXPIRED', async () => {
      const today = await issued()
      await pool.query('UPDATE subscriptions SET quotation_valid_until = $2 WHERE id=$1', [today.id, shift(0)])
      expect((await request(app).post(`/api/v1/quotations/${today.id}/confirm`).set(as('staff'))).status).toBe(200) // valid through today
      const late = await issued()
      await pool.query('UPDATE subscriptions SET quotation_valid_until = $2 WHERE id=$1', [late.id, shift(-1)])
      const r = await request(app).post(`/api/v1/quotations/${late.id}/confirm`).set(as('staff'))
      expect(r.status).toBe(409); expect(r.body.error.code).toBe('QUOTATION_EXPIRED')
      expect(await status(late.id)).toBe('quotation')
      expect((await request(app).get(`/api/v1/quotations/${late.id}`).set(as('staff'))).body.data).toMatchObject({ display_status: 'Quotation (expired)', can_confirm: false })
    })
    it('confirm re-validates the plan (deactivated or raised minimum after saving)', async () => {
      const q = await issued()
      await pool.query('UPDATE plans SET is_active=false WHERE id=$1', [planId])
      expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))).body.error.code).toBe('PLAN_NOT_AVAILABLE')
      await pool.query('UPDATE plans SET is_active=true, min_quantity=99 WHERE id=$1', [planId])
      expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))).body.error.code).toBe('QUANTITY_BELOW_MINIMUM')
      expect(await status(q.id)).toBe('quotation')
    })
    it.each([
      ['confirm a draft', 'confirm', 'draft'], ['issue twice', 'issue', 'quotation'], ['issue a confirmed', 'issue', 'confirmed'],
      ['confirm twice', 'confirm', 'confirmed'], ['cancel a closed', 'cancel', 'closed'], ['issue a closed', 'issue', 'closed'], ['confirm a closed', 'confirm', 'closed'],
    ])('rejects invalid transition: %s (409)', async (_n, action, from) => {
      const q = await mk()
      const set: Record<string, string> = { draft: '', quotation: "status='quotation', quotation_valid_until=CURRENT_DATE+5", confirmed: "status='confirmed', quotation_valid_until=CURRENT_DATE+5, confirmed_at=now()", closed: "status='closed', closed_at=now(), closed_reason='cancelled'" }
      if (set[from]) await pool.query(`UPDATE subscriptions SET ${set[from]} WHERE id=$1`, [q.id])
      const r = await request(app).post(`/api/v1/quotations/${q.id}/${action}`).set(as('staff')).send(action === 'issue' ? { valid_until: shift(5) } : {})
      expect(r.status).toBe(409); expect(r.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(await status(q.id)).toBe(from)
    })
    it('cancel works from draft, quotation and confirmed → closed/cancelled with reason in the audit', async () => {
      const d = await mk()
      const a = await request(app).post(`/api/v1/quotations/${d.id}/cancel`).set(as('staff')).send({ reason: 'Changed mind' })
      expect(a.body.data).toMatchObject({ status: 'closed', closed_reason: 'cancelled', can_cancel: false, can_edit: false })
      const rows = await pool.query("SELECT new_values FROM audit_logs WHERE entity_id=$1 AND action='subscription.cancel'", [d.id])
      expect(rows.rows[0].new_values).toMatchObject({ status: 'closed', reason: 'Changed mind' })
      const q = await issued(); expect((await request(app).post(`/api/v1/quotations/${q.id}/cancel`).set(as('admin')).send({})).status).toBe(200)
      const c = await issued(); await request(app).post(`/api/v1/quotations/${c.id}/confirm`).set(as('staff'))
      expect((await request(app).post(`/api/v1/quotations/${c.id}/cancel`).set(as('staff')).send({})).body.data.status).toBe('closed')
      expect((await request(app).post(`/api/v1/quotations/${d.id}/cancel`).set(as('staff')).send({})).status).toBe(409) // closed is terminal
      expect((await request(app).post(`/api/v1/quotations/${d.id}/cancel`).set(as('staff')).send({ reason: 'x'.repeat(501) })).status).toBe(422)
    })
    it('cancel is refused once invoices exist for the subscription (F11/F12 own those)', async () => {
      const q = await issued(); await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))
      await pool.query(`INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, issue_date, due_date, customer_name, customer_email, payment_term_name, subtotal, tax_total, total)
        VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,'n','e@x.co','Net 15',0,0,0)`, [q.id, customerId])
      expect((await request(app).post(`/api/v1/quotations/${q.id}/cancel`).set(as('staff')).send({})).status).toBe(409)
      expect(await status(q.id)).toBe('confirmed')
    })
    it('the invoice FK now protects a subscription that has invoices from deletion', async () => {
      const q = await issued()
      await pool.query(`INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, issue_date, due_date, customer_name, customer_email, payment_term_name, subtotal, tax_total, total)
        VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,'n','e@x.co','Net 15',0,0,0)`, [q.id, customerId])
      await expect(pool.query('DELETE FROM subscriptions WHERE id=$1', [q.id])).rejects.toThrow(/foreign key|fk_invoices_subscription_id/)
    })
    it('concurrent confirms: exactly one wins, one audit row, second gets INVALID_STATE_TRANSITION', async () => {
      const q = await issued()
      const rs = await Promise.all([1, 2, 3, 4].map(() => request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff'))))
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409, 409])
      expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect((await audit(q.id)).filter((a) => a === 'subscription.confirm')).toHaveLength(1)
    })
    it('concurrent confirm vs cancel never leaves an inconsistent row', async () => {
      for (let i = 0; i < 4; i++) {
        const q = await issued()
        const [c, x] = await Promise.all([request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('staff')), request(app).post(`/api/v1/quotations/${q.id}/cancel`).set(as('staff')).send({})])
        expect([200, 409]).toContain(c.status); expect(x.status).toBe(200)
        expect(await status(q.id)).toBe('closed')
        const r = (await pool.query('SELECT closed_at, closed_reason FROM subscriptions WHERE id=$1', [q.id])).rows[0]
        expect(r.closed_at).not.toBeNull(); expect(r.closed_reason).toBe('cancelled')
      }
    })
  })

  describe('customer confirmation (own quotation only)', () => {
    it('a customer confirms their own quotation and gets a trimmed response (no costs)', async () => {
      const q = await issued()
      const r = await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('alice'))
      expect(r.status).toBe(200)
      expect(r.body.data).toEqual({ id: q.id, number: q.number, status: 'confirmed', display_status: 'Confirmed', start_date: q.start_date, expiry_date: q.expiry_date })
    })
    it("another customer's quotation looks nonexistent (404) and is untouched", async () => {
      const q = await issued()
      expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('bob'))).status).toBe(404)
      expect(await status(q.id)).toBe('quotation')
    })
    it('a customer confirming a draft gets 409; an expired one 409 QUOTATION_EXPIRED', async () => {
      const d = await mk()
      expect((await request(app).post(`/api/v1/quotations/${d.id}/confirm`).set(as('alice'))).status).toBe(409)
      const q = await issued(); await pool.query('UPDATE subscriptions SET quotation_valid_until=$2 WHERE id=$1', [q.id, shift(-2)])
      expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as('alice'))).body.error.code).toBe('QUOTATION_EXPIRED')
    })
  })

  describe('authorization matrix', () => {
    it('401 for anonymous; customers get 403 everywhere except confirming their own', async () => {
      const q = await issued()
      const calls: Array<[string, string, object?]> = [
        ['get', '/api/v1/quotations'], ['post', '/api/v1/quotations', body()], ['get', `/api/v1/quotations/${q.id}`], ['patch', `/api/v1/quotations/${q.id}`, { expiry_date: shift(400) }],
        ['post', `/api/v1/quotations/${q.id}/issue`, {}], ['post', `/api/v1/quotations/${q.id}/cancel`, {}],
        ['get', '/api/v1/subscriptions'], ['post', '/api/v1/subscriptions', body()], ['get', `/api/v1/subscriptions/${q.id}`], ['patch', `/api/v1/subscriptions/${q.id}`, { expiry_date: shift(400) }], ['get', `/api/v1/subscriptions/${q.id}/history`],
      ]
      for (const [m, url, b] of calls) {
        expect((await (request(app) as any)[m](url).send(b)).status, `anon ${m} ${url}`).toBe(401)
        expect((await (request(app) as any)[m](url).set(as('alice')).send(b)).status, `customer ${m} ${url}`).toBe(403)
      }
      expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).send({})).status).toBe(401)
      expect(await status(q.id)).toBe('quotation')
    })
    it('Admin and Staff can run the whole workflow; forged identity headers are ignored', async () => {
      for (const who of ['admin', 'staff']) {
        const q = (await request(app).post('/api/v1/quotations').set(as(who)).send(body())).body.data
        expect((await request(app).post(`/api/v1/quotations/${q.id}/issue`).set(as(who)).send({ valid_until: shift(5) })).status).toBe(200)
        expect((await request(app).post(`/api/v1/quotations/${q.id}/confirm`).set(as(who))).status).toBe(200)
      }
      const forged = await request(app).get('/api/v1/quotations').set({ 'x-user-role': 'admin' })
      expect(forged.status).toBe(401)
      expect((await request(app).get('/api/v1/quotations').set('Authorization', 'Bearer admin-token')).status).toBe(401)
    })
  })

  describe('list and detail', () => {
    it('quotation list shows only draft/quotation; subscription list shows all; filters, search, sort, paging work', async () => {
      const bobSub = await createPlan(pool, { min_quantity: 1 })
      const a = await mk(); const b = await issued(); const c = await issued()
      await request(app).post(`/api/v1/quotations/${c.id}/confirm`).set(as('staff'))
      const d = await mk({ customer_id: otherCustomerId, plan_id: bobSub, items: [{ product_id: productId, quantity: 1 }] })
      const ids = async (qs: string, path = 'quotations') => (await request(app).get(`/api/v1/${path}?${qs}`).set(as('staff'))).body.data.map((s: any) => s.id)
      expect((await ids('sort=number')).sort()).toEqual([a.id, b.id, d.id].sort())
      expect(await ids('status=draft&sort=number')).toEqual([a.id, d.id])
      expect(await ids('sort=number', 'subscriptions')).toEqual([a.id, b.id, c.id, d.id])
      expect(await ids('status=confirmed', 'subscriptions')).toEqual([c.id])
      expect(await ids(`customer_id=${otherCustomerId}`, 'subscriptions')).toEqual([d.id])
      expect(await ids(`plan_id=${bobSub}`, 'subscriptions')).toEqual([d.id])
      expect(await ids('q=bob', 'subscriptions')).toEqual([d.id])
      expect(await ids(`q=${a.number}`, 'subscriptions')).toEqual([a.id])
      expect(await ids('billing_frequency=monthly&sort=-number', 'subscriptions')).toEqual([d.id, c.id, b.id, a.id])
      expect(await ids(`valid_until_to=${shift(11)}&sort=number`)).toEqual([b.id, c.id].filter((x) => x !== c.id))
      expect(await ids(`expiry_from=${shift(371)}`, 'subscriptions')).toEqual([])
      const page = await request(app).get('/api/v1/subscriptions?sort=number&page_size=2&page=2').set(as('staff'))
      expect(page.body.meta).toMatchObject({ page: 2, total: 4, total_pages: 2 }); expect(page.body.data.map((s: any) => s.id)).toEqual([c.id, d.id])
      expect(page.body.data[0]).toEqual(expect.objectContaining({ customer: { id: customerId, name: 'Alice Customer' }, plan: expect.any(Object), display_status: 'Confirmed', total_per_period: '9204.00' }))
      for (const qs of ['bogus=1', 'sort=amount', 'status=paused', 'page_size=101']) expect((await request(app).get(`/api/v1/subscriptions?${qs}`).set(as('staff'))).status, qs).toBe(422)
    })
    it('detail 404 for unknown/malformed ids and history 404', async () => {
      expect((await request(app).get('/api/v1/subscriptions/99999').set(as('staff'))).status).toBe(404)
      expect((await request(app).get('/api/v1/subscriptions/abc').set(as('staff'))).status).toBe(422)
      expect((await request(app).get('/api/v1/subscriptions/99999/history').set(as('staff'))).status).toBe(404)
    })
  })
})
