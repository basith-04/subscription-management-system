// F14 customer-isolation tests. Real migrations (F00…F13) in an isolated schema; two customers with their own
// subscriptions, quotations, invoices and payments. Subscriptions/quotations are created through the real F09 API,
// payments through the real F13 API; only invoices come from the F11 test factory (F12 not in scope).
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlan, createProduct, firstPaymentTerm } from '../../factories/catalogue.factory.js'
import { createInvoice } from '../../factories/invoice.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createSubscriptionTestDb, type SubscriptionTestDb } from '../../helpers/subscriptions-test-db.js'
import { todayInAppTimezone } from '../../../src/lib/dates.js'

const dbAvailable = await canConnect()
const shift = (days: number) => { const d = new Date(`${todayInAppTimezone()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const FORBIDDEN = ['created_by', 'last_billing_error', 'template_id', 'customer_id', 'billing_run_id', 'sent_at', 'cancel_reason', 'recorded_by', 'void_reason', 'note', 'can_edit', 'can_cancel', 'can_send', 'created_at', 'updated_at', 'cost_price']
const keysDeep = (v: unknown, acc = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.add(k); keysDeep(x, acc) }
  return acc
}

describe.skipIf(!dbAvailable)('F14 customer portal (/me/*) isolation', () => {
  let fixture: SubscriptionTestDb, pool: Pool, app: Express
  const jar: Record<string, string> = {}
  const as = (k: string) => ({ Cookie: jar[k] ?? '' })
  let A = 0, B = 0, planId = 0, productId = 0, termId = 0
  // ids per customer
  const a: Record<string, number> = {}, b: Record<string, number> = {}

  const login = async (key: string, email: string) => {
    const r = await request(app).post('/api/v1/auth/login').send({ email, password: 'Example!Pass123' }); expect(r.status).toBe(200); jar[key] = cookiePair(r)
  }
  const quote = async (customer: number, confirmStep: 'draft' | 'quotation' | 'confirmed') => {
    const r = await request(app).post('/api/v1/quotations').set(as('staff')).send({
      customer_id: customer, plan_id: planId, payment_term_id: termId, start_date: shift(3), expiry_date: shift(300), items: [{ product_id: productId, quantity: 2, unit_price: '100.00' }] })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const id = r.body.data.id as number
    if (confirmStep !== 'draft') await request(app).post(`/api/v1/quotations/${id}/issue`).set(as('staff')).send({ valid_until: shift(10) })
    if (confirmStep === 'confirmed') await request(app).post(`/api/v1/quotations/${id}/confirm`).set(as('staff'))
    return id
  }
  const invoice = (customer: number, subscription: number, status: 'draft' | 'confirmed' | 'paid' | 'cancelled', dueDays = 10, amount = '100.00') =>
    createInvoice(pool, { customerId: customer, subscriptionId: subscription, status, issueDate: shift(-20), dueDate: shift(dueDays), lines: [{ quantity: 1, unit_price: amount, tax_name: null }] })

  beforeAll(async () => { fixture = await createSubscriptionTestDb(); pool = fixture.pool; app = createTestApp(pool) })
  afterAll(async () => { await fixture.teardown() })
  beforeEach(async () => {
    await fixture.reset()
    await pool.query("DELETE FROM tax_rules WHERE name LIKE 'Test %'")
    await createUser(pool, { email: 'admin@example.com', role: 'admin' })
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    A = (await createUser(pool, { email: 'alice@example.com', role: 'customer', fullName: 'Alice A' })).customer_id!
    B = (await createUser(pool, { email: 'bob@example.com', role: 'customer', fullName: 'Bob B' })).customer_id!
    await createUser(pool, { email: 'orphan@example.com', role: 'customer', createCustomer: false })
    planId = await createPlan(pool, { min_quantity: 1 }); productId = await createProduct(pool); termId = await firstPaymentTerm(pool)
    for (const [k, e] of [['admin', 'admin@example.com'], ['staff', 'staff@example.com'], ['alice', 'alice@example.com'], ['bob', 'bob@example.com'], ['orphan', 'orphan@example.com']]) await login(k!, e!)

    a.draft = await quote(A, 'draft'); a.quotation = await quote(A, 'quotation'); a.confirmed = await quote(A, 'confirmed')
    b.draft = await quote(B, 'draft'); b.quotation = await quote(B, 'quotation'); b.confirmed = await quote(B, 'confirmed')
    a.invDraft = await invoice(A, a.confirmed!, 'draft'); a.inv = await invoice(A, a.confirmed!, 'confirmed', 10, '100.00')
    a.invOverdue = await invoice(A, a.confirmed!, 'confirmed', -5, '40.00'); a.invCancelled = await invoice(A, a.confirmed!, 'cancelled'); a.invPaid = await invoice(A, a.confirmed!, 'paid')
    b.invDraft = await invoice(B, b.confirmed!, 'draft'); b.inv = await invoice(B, b.confirmed!, 'confirmed', 10, '555.00'); b.invOverdue = await invoice(B, b.confirmed!, 'confirmed', -9, '777.00')
    // payments through the real F13 API: A pays 30 on a.inv; B pays 100 on b.inv then it is voided
    const pay = (customerInv: number, amount: string, ref: string) => request(app).post('/api/v1/payments').set(as('staff')).send({ method: 'upi', amount, payment_date: shift(0), reference_number: ref, allocations: [{ invoice_id: customerInv, amount }] })
    a.pay = (await pay(a.inv!, '30.00', 'A-1')).body.data.id
    b.pay = (await pay(b.inv!, '100.00', 'B-1')).body.data.id
    const alicePay2 = await pay(a.invOverdue!, '10.00', 'A-2'); a.pay2 = alicePay2.body.data.id
    await request(app).post(`/api/v1/payments/${a.pay2}/void`).set(as('admin')).send({ reason: 'typo' })
  })

  describe('authentication and role matrix', () => {
    const paths = () => ['/me/subscriptions', `/me/subscriptions/${a.confirmed}`, '/me/invoices', `/me/invoices/${a.inv}`, `/me/invoices/${a.inv}/print`]
    it('401 anonymous / bad cookie; 403 for Admin and Staff (no privilege hierarchy); 403 for a customer with no linked profile', async () => {
      for (const p of paths()) {
        expect((await request(app).get(`/api/v1${p}`)).status, `anon ${p}`).toBe(401)
        expect((await request(app).get(`/api/v1${p}`).set({ Cookie: 'brightloop_session=garbage' })).status, `bad cookie ${p}`).toBe(401)
        expect((await request(app).get(`/api/v1${p}`).set(as('admin'))).status, `admin ${p}`).toBe(403)
        expect((await request(app).get(`/api/v1${p}`).set(as('staff'))).status, `staff ${p}`).toBe(403)
        expect((await request(app).get(`/api/v1${p}`).set(as('orphan'))).status, `orphan ${p}`).toBe(403)
        expect((await request(app).get(`/api/v1${p}`).set(as('alice'))).status, `own ${p}`).toBe(200)
      }
    })
    it('forged identity headers and client-supplied customer_id are ignored / rejected', async () => {
      expect((await request(app).get('/api/v1/me/subscriptions').set({ 'x-user-role': 'customer', 'x-user-id': '1' })).status).toBe(401)
      for (const p of ['/me/subscriptions', '/me/invoices']) {
        expect((await request(app).get(`/api/v1${p}?customer_id=${B}`).set(as('alice'))).status).toBe(422)
      }
    })
  })

  describe('subscriptions', () => {
    it("lists only the caller's non-draft subscriptions and quotations; never the other customer's", async () => {
      const res = await request(app).get('/api/v1/me/subscriptions?sort=number').set(as('alice'))
      expect(res.body.data.map((s: any) => s.id)).toEqual([a.quotation, a.confirmed])
      expect(res.body.meta.total).toBe(2)
      const bob = await request(app).get('/api/v1/me/subscriptions?sort=number').set(as('bob'))
      expect(bob.body.data.map((s: any) => s.id)).toEqual([b.quotation, b.confirmed])
      expect(res.body.data[0]).toMatchObject({ number: expect.any(String), plan: { name: expect.any(String) }, status: 'quotation', next_billing_date: null, expiry_date: shift(300), can_confirm: true, can_pause: false })
      expect(JSON.stringify(res.body)).not.toContain(String(b.quotation) + '"')
    })
    it('filters by status, paginates and rejects drafts / unknown filters', async () => {
      const q = await request(app).get('/api/v1/me/subscriptions?status=confirmed').set(as('alice'))
      expect(q.body.data.map((s: any) => s.id)).toEqual([a.confirmed])
      const p2 = await request(app).get('/api/v1/me/subscriptions?page_size=1&page=2&sort=number').set(as('alice'))
      expect(p2.body.meta).toMatchObject({ page: 2, total: 2, total_pages: 2 }); expect(p2.body.data).toHaveLength(1)
      for (const qs of ['status=draft', 'bogus=1', 'sort=cost']) expect((await request(app).get(`/api/v1/me/subscriptions?${qs}`).set(as('alice'))).status, qs).toBe(422)
    })
    it('own detail is 200 with lines and no internal fields; draft, other customer and unknown ids are indistinguishable 404s', async () => {
      const own = await request(app).get(`/api/v1/me/subscriptions/${a.confirmed}`).set(as('alice'))
      expect(own.status).toBe(200)
      expect(own.body.data).toMatchObject({ id: a.confirmed, status: 'confirmed', items: [{ description: expect.any(String), quantity: 2, unit_price: '100.00' }], totals: { subtotal: '200.00' }, payment_term: expect.any(String) })
      for (const k of FORBIDDEN) expect(keysDeep(own.body).has(k), k).toBe(false)
      const strip = (r: request.Response) => ({ status: r.status, code: r.body.error.code, message: r.body.error.message })
      const others = [await request(app).get(`/api/v1/me/subscriptions/${b.confirmed}`).set(as('alice')), await request(app).get(`/api/v1/me/subscriptions/${b.quotation}`).set(as('alice')),
        await request(app).get(`/api/v1/me/subscriptions/${b.draft}`).set(as('alice')), await request(app).get(`/api/v1/me/subscriptions/${a.draft}`).set(as('alice')), await request(app).get('/api/v1/me/subscriptions/999999').set(as('alice'))]
      for (const r of others) expect(strip(r)).toEqual({ status: 404, code: 'NOT_FOUND', message: 'Subscription not found' })
      expect(JSON.stringify(others.map((r) => r.body))).not.toMatch(/SUB-|Bob|bob@/)
    })
  })

  describe('invoices', () => {
    it('lists only own non-draft invoices (cancelled shown) and reports backend totals that exclude cancelled, draft, other customers and voided payments', async () => {
      const res = await request(app).get('/api/v1/me/invoices?sort=number').set(as('alice'))
      expect(res.body.data.map((i: any) => i.id).sort()).toEqual([a.inv, a.invOverdue, a.invCancelled, a.invPaid].sort())
      expect(res.body.data.some((i: any) => i.id === a.invDraft || i.id === b.inv)).toBe(false)
      // A owes: a.inv 100-30=70 + a.invOverdue 40 (voided 10 does not count) = 110; overdue = 40
      expect(res.body.meta.summary).toEqual({ outstanding_amount: '110.00', overdue_amount: '40.00' })
      expect(res.body.data.find((i: any) => i.id === a.invCancelled)).toMatchObject({ payment_state: 'cancelled', status: 'cancelled' })
      const bob = await request(app).get('/api/v1/me/invoices').set(as('bob'))
      expect(bob.body.meta.summary).toEqual({ outstanding_amount: '1232.00', overdue_amount: '777.00' })
    })
    it('payment_state and status filters, pagination and validation', async () => {
      const ids = async (qs: string) => (await request(app).get(`/api/v1/me/invoices?${qs}`).set(as('alice'))).body.data.map((i: any) => i.id)
      expect(await ids('payment_state=overdue')).toEqual([a.invOverdue])
      expect((await ids('payment_state=paid')).sort()).toEqual([a.invPaid])
      expect(await ids('status=cancelled')).toEqual([a.invCancelled])
      expect((await ids('payment_state=partially_paid'))).toEqual([a.inv])
      const p = await request(app).get('/api/v1/me/invoices?page_size=2&page=2').set(as('alice'))
      expect(p.body.meta).toMatchObject({ page: 2, page_size: 2, total: 4, total_pages: 2 })
      for (const qs of ['status=draft', 'payment_state=draft', 'payment_state=late']) expect((await request(app).get(`/api/v1/me/invoices?${qs}`).set(as('alice'))).status, qs).toBe(422)
    })
    it('detail: own invoice with items, totals and payments[] (voided flagged); no internal fields', async () => {
      const own = await request(app).get(`/api/v1/me/invoices/${a.inv}`).set(as('alice'))
      expect(own.status).toBe(200)
      expect(own.body.data).toMatchObject({ id: a.inv, status: 'confirmed', payment_state: 'partially_paid', amount_paid: '30.00', amount_due: '70.00',
        customer: { name: 'Alice A' }, payments: [{ method: 'upi', amount: '30.00', reference_number: 'A-1', is_voided: false }] })
      for (const k of FORBIDDEN) expect(keysDeep(own.body).has(k), k).toBe(false)
      const voided = await request(app).get(`/api/v1/me/invoices/${a.invOverdue}`).set(as('alice'))
      expect(voided.body.data.payments).toEqual([expect.objectContaining({ amount: '10.00', is_voided: true })])
      expect(voided.body.data).toMatchObject({ amount_paid: '0.00', amount_due: '40.00', payment_state: 'overdue' })
    })
    it('other customers, drafts and unknown ids are the same neutral 404 for detail and print', async () => {
      const targets = [b.inv, b.invOverdue, b.invDraft, a.invDraft, 999999]
      for (const suffix of ['', '/print']) {
        const rs = await Promise.all(targets.map((id) => request(app).get(`/api/v1/me/invoices/${id}${suffix}`).set(as('alice'))))
        for (const r of rs) { expect(r.status).toBe(404); expect(r.body.error.code).toBe('NOT_FOUND'); expect(r.body.error.message).toBe('Invoice not found') }
        expect(JSON.stringify(rs.map((r) => r.body))).not.toMatch(/INV-|Bob|555|777/)
      }
    })
    it('print renders the F11 document for the owner only, from the stored snapshot', async () => {
      await pool.query("UPDATE customers SET name='Renamed Later' WHERE id=$1", [A])
      const r = await request(app).get(`/api/v1/me/invoices/${a.inv}/print`).set(as('alice'))
      expect(r.status).toBe(200); expect(r.headers['content-type']).toMatch(/text\/html/); expect(r.headers['cache-control']).toBe('no-store')
      expect(r.text).toContain('Alice A'); expect(r.text).not.toContain('Renamed Later'); expect(r.text).toContain('@page'); expect(r.text).not.toContain('Bob B')
    })
  })

  describe('actions reachable from the portal', () => {
    it("confirm: own quotation succeeds; another customer's is 404 and untouched; own draft is 409", async () => {
      expect((await request(app).post(`/api/v1/quotations/${b.quotation}/confirm`).set(as('alice'))).status).toBe(404)
      expect((await pool.query('SELECT status FROM subscriptions WHERE id=$1', [b.quotation])).rows[0].status).toBe('quotation')
      expect((await request(app).post(`/api/v1/quotations/${b.draft}/confirm`).set(as('alice'))).status).toBe(404)
      expect((await request(app).post(`/api/v1/quotations/${a.draft}/confirm`).set(as('alice'))).status).toBe(409)
      const ok = await request(app).post(`/api/v1/quotations/${a.quotation}/confirm`).set(as('alice'))
      expect(ok.status).toBe(200); expect(ok.body.data.status).toBe('confirmed')
      expect((await request(app).get(`/api/v1/me/subscriptions/${a.quotation}`).set(as('alice'))).body.data).toMatchObject({ status: 'confirmed', can_confirm: false })
    })
    // F10's pause/resume/renew/close endpoints are NOT on main yet (customers get 403 from the back-office router, or 404 for
    // an unmounted route). This test therefore only proves nothing succeeds or changes today. When F10 ships (role C, own only)
    // tighten the expectation to exactly 404 for another customer's id.
    it.each(['pause', 'resume', 'renew', 'close'])("%s on another customer's subscription never succeeds and changes nothing", async (action) => {
      for (const id of [b.confirmed, b.quotation, 999999]) {
        const r = await request(app).post(`/api/v1/subscriptions/${id}/${action}`).set(as('alice')).send({})
        expect([403, 404], `${action} ${id}`).toContain(r.status)
      }
      expect((await pool.query('SELECT status, paused_at FROM subscriptions WHERE id=$1', [b.confirmed])).rows[0]).toMatchObject({ status: 'confirmed', paused_at: null })
    })
    it('the portal never offers F10 actions while they have no endpoint', async () => {
      await pool.query("UPDATE subscriptions SET status='active', activated_at=now() WHERE id=$1", [a.confirmed])
      const d = (await request(app).get(`/api/v1/me/subscriptions/${a.confirmed}`).set(as('alice'))).body.data
      expect(d).toMatchObject({ can_pause: false, can_resume: false, can_renew: false, can_close: false })
    })
  })

  it('pure customer isolation sweep: nothing in any of Alice\'s responses mentions Bob\'s data', async () => {
    const bodies = [
      await request(app).get('/api/v1/me/subscriptions').set(as('alice')), await request(app).get('/api/v1/me/invoices').set(as('alice')),
      await request(app).get(`/api/v1/me/invoices/${a.inv}`).set(as('alice')), await request(app).get(`/api/v1/me/subscriptions/${a.confirmed}`).set(as('alice')),
    ].map((r) => JSON.stringify(r.body)).join(' ')
    expect(bodies).not.toMatch(/Bob|bob@example|B-1/)
    const bobNumbers = (await pool.query<{ n: string }>('SELECT number AS n FROM subscriptions WHERE customer_id=$1 UNION SELECT number FROM invoices WHERE customer_id=$1', [B])).rows.map((r) => r.n)
    for (const n of bobNumbers) expect(bodies).not.toContain(n)
  })
})
