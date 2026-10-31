// F13 API tests. Real F00/F05/F06/F11/F13 migrations in an isolated schema. Confirmed invoices and the F09
// `subscriptions` rows come from FACTORIES (F12 / F09 not merged); everything payment-related hits the real tables.
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createInvoice, createSubscriptionStandIn } from '../../factories/invoice.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createInvoiceTestDb, type InvoiceTestDb } from '../../helpers/invoices-test-db.js'
import { reconciliationMismatches } from '../../../src/modules/payments/index.js'
import { todayInBusinessTimezone } from '../../../src/modules/invoices/invoices.payment-state.js'

const dbAvailable = await canConnect()
const PASSWORD = 'Example!Pass123'
const shift = (days: number) => {
  const d = new Date(`${todayInBusinessTimezone()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}

describe.skipIf(!dbAvailable)('F13 payments API', () => {
  let fixture: InvoiceTestDb
  let pool: Pool
  let app: Express
  const cookies: Record<string, string> = {}
  let customerId: number
  let otherCustomerId: number
  let subId: number
  const as = (k: string) => ({ Cookie: cookies[k] ?? '' })

  async function loginAs(key: string, email: string) {
    const r = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })
    expect(r.status).toBe(200); cookies[key] = cookiePair(r)
  }
  /** Confirmed invoice for 100.00 (one line, no tax) unless told otherwise. */
  const inv = (o: Partial<Parameters<typeof createInvoice>[1]> = {}) =>
    createInvoice(pool, { customerId, subscriptionId: subId, status: 'confirmed', dueDate: shift(10), issueDate: shift(-5),
      lines: [{ quantity: 1, unit_price: '100.00', tax_name: null }], ...o })
  const pay = (body: Record<string, unknown>, who = 'staff') => request(app).post('/api/v1/payments').set(as(who)).send({
    method: 'bank_transfer', amount: '100.00', payment_date: shift(0), ...body })
  const row = async (id: number) => (await pool.query('SELECT status, amount_paid, amount_due, paid_at FROM invoices WHERE id=$1', [id])).rows[0]
  const reconciled = async () => expect(await reconciliationMismatches(pool)).toEqual([])
  const audit = async (type: string, id: number) =>
    (await pool.query<{ action: string }>('SELECT action FROM audit_logs WHERE entity_type=$1 AND entity_id=$2 ORDER BY id', [type, id])).rows.map((r) => r.action)

  beforeAll(async () => {
    fixture = await createInvoiceTestDb(); pool = fixture.pool; app = createTestApp(pool)
  })
  afterAll(async () => { await fixture.teardown() })
  beforeEach(async () => {
    await fixture.reset()
    await createUser(pool, { email: 'admin@example.com', role: 'admin' })
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    customerId = (await createUser(pool, { email: 'alice@example.com', role: 'customer', fullName: 'Alice Customer' })).customer_id!
    otherCustomerId = (await createUser(pool, { email: 'bob@example.com', role: 'customer', fullName: 'Bob Other' })).customer_id!
    subId = (await createSubscriptionStandIn(pool, customerId)).id
    for (const [k, e] of [['admin', 'admin@example.com'], ['staff', 'staff@example.com'], ['alice', 'alice@example.com']]) await loginAs(k!, e!)
  })

  describe('record: partial → full → paid', () => {
    it('partial payment leaves the invoice confirmed and outstanding', async () => {
      const id = await inv()
      const res = await pay({ amount: '40.00', allocations: [{ invoice_id: id, amount: '40.00' }], reference_number: 'TXN-1', note: 'first part' })
      expect(res.status).toBe(201)
      expect(res.headers.location).toMatch(/\/payments\/\d+$/)
      expect(res.body.data).toMatchObject({
        method: 'bank_transfer', amount: '40.00', reference_number: 'TXN-1', is_voided: false, customer: { id: customerId, name: 'Alice Customer' },
        allocations: [{ invoice_id: id, amount: '40.00' }],
        invoices: [{ id, status: 'confirmed', payment_state: 'partially_paid', amount_paid: '40.00', amount_due: '60.00' }],
      })
      expect(await row(id)).toMatchObject({ status: 'confirmed', amount_paid: '40.00', amount_due: '60.00', paid_at: null })
      await reconciled()
      expect(await audit('payment', res.body.data.id)).toEqual(['payment.record'])
    })

    it('final payment moves the invoice to paid through the F11 transition and stamps paid_at', async () => {
      const id = await inv()
      await pay({ amount: '40.00', allocations: [{ invoice_id: id, amount: '40.00' }] })
      const last = await pay({ amount: '60.00', allocations: [{ invoice_id: id, amount: '60.00' }], payment_date: shift(0) , method: 'cash' })
      expect(last.status).toBe(201)
      expect(last.body.data.invoices[0]).toMatchObject({ status: 'paid', payment_state: 'paid', amount_due: '0.00' })
      const r = await row(id)
      expect(r).toMatchObject({ status: 'paid', amount_paid: '100.00', amount_due: '0.00' })
      expect(r.paid_at).not.toBeNull()
      expect(await audit('invoice', id)).toContain('invoice.paid')
      await reconciled()
    })

    it('decimal arithmetic: 0.10 + 0.20 settles a 0.30 invoice exactly', async () => {
      const id = await inv({ lines: [{ quantity: 1, unit_price: '0.30', tax_name: null }] })
      await pay({ amount: '0.10', allocations: [{ invoice_id: id, amount: '0.10' }], method: 'cash' })
      await pay({ amount: '0.20', allocations: [{ invoice_id: id, amount: '0.20' }], method: 'upi' })
      expect(await row(id)).toMatchObject({ status: 'paid', amount_paid: '0.30', amount_due: '0.00' })
      await reconciled()
    })

    it('a partial payment on a past-due invoice stays overdue; a full one is no longer outstanding or overdue', async () => {
      const id = await inv({ issueDate: shift(-40), dueDate: shift(-20) })
      const partial = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }], method: 'cash' })
      expect(partial.body.data.invoices[0].payment_state).toBe('overdue')
      const listed = await request(app).get('/api/v1/invoices?payment_state=overdue').set(as('staff'))
      expect(listed.body.data.map((r: any) => r.id)).toEqual([id])
      await pay({ amount: '90.00', allocations: [{ invoice_id: id, amount: '90.00' }], method: 'upi' })
      const after = await request(app).get('/api/v1/invoices?payment_state=overdue,outstanding,partially_paid,not_due').set(as('staff'))
      expect(after.body.data).toEqual([])
    })

    it('one payment can settle several invoices of the same customer', async () => {
      const a = await inv(); const b = await inv({ lines: [{ quantity: 1, unit_price: '50.00', tax_name: null }] })
      const res = await pay({ amount: '160.00', allocations: [{ invoice_id: a, amount: '100.00' }, { invoice_id: b, amount: '50.00' }] })
      expect(res.status).toBe(201)
      expect(res.body.data.allocations).toHaveLength(2)
      expect((await row(a)).status).toBe('paid'); expect((await row(b)).status).toBe('paid')
      await reconciled()
    })
  })

  describe('validation and rejections', () => {
    it('rejects over-allocation of an invoice with 422 ALLOCATION_EXCEEDS_AMOUNT_DUE and changes nothing', async () => {
      const id = await inv()
      const res = await pay({ amount: '200.00', allocations: [{ invoice_id: id, amount: '100.01' }] })
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('ALLOCATION_EXCEEDS_AMOUNT_DUE')
      expect(res.body.error.details[0].field).toBe('allocations.0.amount')
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(0)
      expect(await row(id)).toMatchObject({ amount_paid: '0.00' })
    })
    it('rejects allocations that exceed the payment amount (422)', async () => {
      const a = await inv(); const b = await inv()
      const res = await pay({ amount: '100.00', allocations: [{ invoice_id: a, amount: '60.00' }, { invoice_id: b, amount: '60.00' }] })
      expect(res.status).toBe(422)
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(0)
    })
    it.each(['draft', 'cancelled', 'paid'] as const)('rejects a %s invoice with 409 INVALID_STATE_TRANSITION', async (status) => {
      const id = await inv({ status })
      const res = await pay({ allocations: [{ invoice_id: id, amount: '10.00' }], amount: '10.00' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION')
    })
    it('rejects invoices of different customers (422) and rolls everything back', async () => {
      const a = await inv()
      const sub2 = (await createSubscriptionStandIn(pool, otherCustomerId)).id
      const b = await createInvoice(pool, { customerId: otherCustomerId, subscriptionId: sub2, status: 'confirmed', lines: [{ quantity: 1, unit_price: '100.00', tax_name: null }] })
      const res = await pay({ amount: '200.00', allocations: [{ invoice_id: a, amount: '100.00' }, { invoice_id: b, amount: '100.00' }] })
      expect(res.status).toBe(422)
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(0)
      expect(await row(a)).toMatchObject({ amount_paid: '0.00' })
    })
    it('multi-invoice allocation is atomic: one failing allocation persists nothing', async () => {
      const ok = await inv(); const bad = await inv({ status: 'draft' })
      const res = await pay({ amount: '200.00', allocations: [{ invoice_id: ok, amount: '100.00' }, { invoice_id: bad, amount: '100.00' }] })
      expect(res.status).toBe(409)
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(0)
      expect((await pool.query('SELECT 1 FROM payment_allocations')).rowCount).toBe(0)
      expect(await row(ok)).toMatchObject({ status: 'confirmed', amount_paid: '0.00' })
    })
    it('rejects future-dated payments, unknown invoices and malformed bodies', async () => {
      const id = await inv()
      const future = await pay({ payment_date: shift(1), allocations: [{ invoice_id: id, amount: '10.00' }], amount: '10.00' })
      expect(future.status).toBe(422); expect(future.body.error.details[0].field).toBe('payment_date')
      expect((await pay({ allocations: [{ invoice_id: 99999, amount: '10.00' }], amount: '10.00' })).status).toBe(404)
      for (const bad of [{ amount: '1.001' }, { method: 'bitcoin' }, { allocations: [] }, { amount: 5 }]) {
        expect((await pay({ allocations: [{ invoice_id: id, amount: '10.00' }], ...bad })).status, JSON.stringify(bad)).toBe(422)
      }
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(0)
    })
  })

  describe('duplicate protection', () => {
    it('rejects a repeated method + reference with 409 DUPLICATE_PAYMENT_REFERENCE', async () => {
      const a = await inv(); const b = await inv()
      expect((await pay({ amount: '10.00', allocations: [{ invoice_id: a, amount: '10.00' }], reference_number: 'CHQ-77', method: 'cheque' })).status).toBe(201)
      const dup = await pay({ amount: '20.00', allocations: [{ invoice_id: b, amount: '20.00' }], reference_number: 'CHQ-77', method: 'cheque' })
      expect(dup.status).toBe(409); expect(dup.body.error.code).toBe('DUPLICATE_PAYMENT_REFERENCE')
      // the same reference under another method is a different payment
      expect((await pay({ amount: '20.00', allocations: [{ invoice_id: b, amount: '20.00' }], reference_number: 'CHQ-77', method: 'upi' })).status).toBe(201)
    })
    it('a voided payment frees its reference', async () => {
      const id = await inv()
      const first = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }], reference_number: 'R-1' })
      expect((await request(app).post(`/api/v1/payments/${first.body.data.id}/void`).set(as('admin')).send({ reason: 'typo' })).status).toBe(200)
      expect((await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }], reference_number: 'R-1' })).status).toBe(201)
    })
    it('concurrent identical references: exactly one succeeds', async () => {
      const a = await inv(); const b = await inv()
      const [x, y] = await Promise.all([
        pay({ amount: '10.00', allocations: [{ invoice_id: a, amount: '10.00' }], reference_number: 'RACE', method: 'upi' }),
        pay({ amount: '10.00', allocations: [{ invoice_id: b, amount: '10.00' }], reference_number: 'RACE', method: 'upi' }),
      ])
      expect([x.status, y.status].sort()).toEqual([201, 409])
      await reconciled()
    })
    it('60-second heuristic: identical resubmission is 409 unless confirm_duplicate is set', async () => {
      const id = await inv()
      const body = { amount: '25.00', allocations: [{ invoice_id: id, amount: '25.00' }], method: 'cash' }
      expect((await pay(body)).status).toBe(201)
      const again = await pay(body)
      expect(again.status).toBe(409); expect(again.body.error.code).toBe('POSSIBLE_DUPLICATE_PAYMENT')
      expect((await pay({ ...body, confirm_duplicate: true })).status).toBe(201)
      expect(await row(id)).toMatchObject({ amount_paid: '50.00' })
      // a different amount is not a duplicate
      expect((await pay({ ...body, amount: '5.00', allocations: [{ invoice_id: id, amount: '5.00' }] })).status).toBe(201)
      // and outside the window it is allowed
      await pool.query("UPDATE payments SET created_at = now() - interval '2 minutes'")
      expect((await pay(body)).status).toBe(201)
      await reconciled()
    })
  })

  describe('concurrency on the last amount', () => {
    it('parallel payments competing for the same remaining balance: exactly one succeeds', async () => {
      const id = await inv()
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
        pay({ amount: '100.00', allocations: [{ invoice_id: id, amount: '100.00' }], method: 'cash', note: `try ${i}`, confirm_duplicate: true })))
      const codes = results.map((r) => r.status).sort()
      expect(codes.filter((c) => c === 201)).toHaveLength(1)
      for (const r of results.filter((x) => x.status !== 201)) {
        expect([409, 422]).toContain(r.status)
        expect(['INVALID_STATE_TRANSITION', 'ALLOCATION_EXCEEDS_AMOUNT_DUE']).toContain(r.body.error.code)
      }
      expect(await row(id)).toMatchObject({ status: 'paid', amount_paid: '100.00' })
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(1)
      await reconciled()
    })
    it('parallel partial payments never over-allocate', async () => {
      const id = await inv()
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
        pay({ amount: '30.00', allocations: [{ invoice_id: id, amount: '30.00' }], method: 'upi', reference_number: `P-${i}`, confirm_duplicate: true })))
      expect(results.filter((r) => r.status === 201)).toHaveLength(3) // 3 × 30 = 90 ≤ 100, the 4th would overpay
      expect(await row(id)).toMatchObject({ status: 'confirmed', amount_paid: '90.00', amount_due: '10.00' })
      await reconciled()
    })
  })

  describe('void', () => {
    it('Admin voids a payment: balance restored, history kept, audit written', async () => {
      const id = await inv()
      const first = await pay({ amount: '40.00', allocations: [{ invoice_id: id, amount: '40.00' }], reference_number: 'A' })
      const second = await pay({ amount: '60.00', allocations: [{ invoice_id: id, amount: '60.00' }], reference_number: 'B', method: 'cash' })
      expect((await row(id)).status).toBe('paid')
      const res = await request(app).post(`/api/v1/payments/${second.body.data.id}/void`).set(as('admin')).send({ reason: '  wrong invoice ' })
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ is_voided: true, void_reason: 'wrong invoice', allocations: [{ invoice_id: id, amount: '60.00' }],
        invoices: [{ id, status: 'confirmed', amount_paid: '40.00', amount_due: '60.00', payment_state: 'partially_paid' }] })
      const r = await row(id)
      expect(r).toMatchObject({ status: 'confirmed', amount_paid: '40.00', paid_at: null })
      // history preserved: both payments and all allocation rows still exist
      expect((await pool.query('SELECT 1 FROM payments')).rowCount).toBe(2)
      expect((await pool.query('SELECT 1 FROM payment_allocations')).rowCount).toBe(2)
      expect(await audit('payment', second.body.data.id)).toEqual(['payment.record', 'payment.void'])
      expect(await audit('invoice', id)).toEqual(expect.arrayContaining(['invoice.paid', 'invoice.reopen']))
      await reconciled()
      // the voided payment is still visible in history and in the invoice's list
      const hist = await request(app).get(`/api/v1/invoices/${id}/payments`).set(as('staff'))
      expect(hist.body.data.map((p: any) => [p.id, p.is_voided])).toEqual(expect.arrayContaining([[second.body.data.id, true], [first.body.data.id, false]]))
    })
    it('voiding the only payment of a confirmed invoice returns it to fully unpaid', async () => {
      const id = await inv()
      const p = await pay({ amount: '30.00', allocations: [{ invoice_id: id, amount: '30.00' }] })
      await request(app).post(`/api/v1/payments/${p.body.data.id}/void`).set(as('admin')).send({ reason: 'x' })
      expect(await row(id)).toMatchObject({ status: 'confirmed', amount_paid: '0.00', amount_due: '100.00' })
      // and the invoice can be cancelled again now that no payment counts
      expect((await request(app).post(`/api/v1/invoices/${id}/cancel`).set(as('staff')).send({ reason: 'after void' })).status).toBe(200)
    })
    it('voids every invoice of a multi-invoice payment', async () => {
      const a = await inv(); const b = await inv()
      const p = await pay({ amount: '200.00', allocations: [{ invoice_id: a, amount: '100.00' }, { invoice_id: b, amount: '100.00' }] })
      const res = await request(app).post(`/api/v1/payments/${p.body.data.id}/void`).set(as('admin')).send({ reason: 'dup' })
      expect(res.body.data.invoices).toHaveLength(2)
      expect((await row(a)).status).toBe('confirmed'); expect((await row(b)).status).toBe('confirmed')
      await reconciled()
    })
    it('rejects a second void (409), a missing reason (422) and unknown payments (404)', async () => {
      const id = await inv()
      const p = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }] })
      const url = `/api/v1/payments/${p.body.data.id}/void`
      expect((await request(app).post(url).set(as('admin')).send({ reason: '' })).status).toBe(422)
      expect((await request(app).post(url).set(as('admin')).send({})).status).toBe(422)
      expect((await request(app).post(url).set(as('admin')).send({ reason: 'ok' })).status).toBe(200)
      const again = await request(app).post(url).set(as('admin')).send({ reason: 'ok' })
      expect(again.status).toBe(409)
      expect((await request(app).post('/api/v1/payments/99999/void').set(as('admin')).send({ reason: 'x' })).status).toBe(404)
      expect(await row(id)).toMatchObject({ amount_paid: '0.00' })
    })
    it('concurrent voids: exactly one wins and the balance is only reversed once', async () => {
      const id = await inv()
      const a = await pay({ amount: '30.00', allocations: [{ invoice_id: id, amount: '30.00' }], method: 'cash' })
      await pay({ amount: '20.00', allocations: [{ invoice_id: id, amount: '20.00' }], method: 'upi' })
      const url = `/api/v1/payments/${a.body.data.id}/void`
      const rs = await Promise.all([1, 2, 3].map(() => request(app).post(url).set(as('admin')).send({ reason: 'race' })))
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409])
      expect(await row(id)).toMatchObject({ amount_paid: '20.00' })
      await reconciled()
    })
    it('exposes no way to edit or delete a payment', async () => {
      const id = await inv()
      const p = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }] })
      expect((await request(app).delete(`/api/v1/payments/${p.body.data.id}`).set(as('admin'))).status).toBe(404)
      expect((await request(app).patch(`/api/v1/payments/${p.body.data.id}`).set(as('admin')).send({ amount: '1.00' })).status).toBe(404)
    })
  })

  describe('reconciliation invariant', () => {
    it('amount_paid = Σ active allocations after partial, full, multi-invoice, multiple payments and voids', async () => {
      const a = await inv(); const b = await inv({ lines: [{ quantity: 1, unit_price: '70.00', tax_name: null }] }); const c = await inv()
      await reconciled()
      const p1 = await pay({ amount: '25.00', allocations: [{ invoice_id: a, amount: '25.00' }], method: 'cash' }); await reconciled()
      await pay({ amount: '50.00', allocations: [{ invoice_id: a, amount: '50.00' }], method: 'upi' }); await reconciled()
      const p3 = await pay({ amount: '145.00', allocations: [{ invoice_id: a, amount: '25.00' }, { invoice_id: b, amount: '70.00' }, { invoice_id: c, amount: '50.00' }], method: 'card' }); await reconciled()
      expect((await row(a)).status).toBe('paid')
      await request(app).post(`/api/v1/payments/${p3.body.data.id}/void`).set(as('admin')).send({ reason: 'r' }); await reconciled()
      await request(app).post(`/api/v1/payments/${p1.body.data.id}/void`).set(as('admin')).send({ reason: 'r' }); await reconciled()
      expect(await row(a)).toMatchObject({ amount_paid: '50.00' })
      expect(await row(b)).toMatchObject({ amount_paid: '0.00' })
    })
    it('the reconciliation query detects drift', async () => {
      const id = await inv()
      await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }] })
      await pool.query('UPDATE invoices SET amount_paid = 5 WHERE id = $1', [id])
      expect((await reconciliationMismatches(pool)).map((m) => Number(m.id))).toEqual([id])
    })
  })

  describe('list, detail and invoice history', () => {
    it('filters by method, customer, invoice, dates, voided and q; sorts; paginates', async () => {
      const a = await inv()
      const sub2 = (await createSubscriptionStandIn(pool, otherCustomerId)).id
      const b = await createInvoice(pool, { customerId: otherCustomerId, subscriptionId: sub2, status: 'confirmed', lines: [{ quantity: 1, unit_price: '100.00', tax_name: null }] })
      const p1 = await pay({ amount: '10.00', allocations: [{ invoice_id: a, amount: '10.00' }], method: 'cash', payment_date: shift(-3), reference_number: 'ALPHA-1' })
      const p2 = await pay({ amount: '30.00', allocations: [{ invoice_id: b, amount: '30.00' }], method: 'upi', payment_date: shift(-1), reference_number: 'BETA-2' })
      const p3 = await pay({ amount: '20.00', allocations: [{ invoice_id: a, amount: '20.00' }], method: 'cash', payment_date: shift(0) })
      await request(app).post(`/api/v1/payments/${p3.body.data.id}/void`).set(as('admin')).send({ reason: 'x' })
      const ids = async (qs: string) => (await request(app).get(`/api/v1/payments?${qs}`).set(as('staff'))).body.data.map((p: any) => p.id)
      expect(await ids('')).toEqual([p3.body.data.id, p2.body.data.id, p1.body.data.id]) // newest payment_date first
      expect(await ids('method=cash')).toEqual([p3.body.data.id, p1.body.data.id])
      expect(await ids(`customer_id=${otherCustomerId}`)).toEqual([p2.body.data.id])
      expect(await ids(`invoice_id=${a}`)).toEqual([p3.body.data.id, p1.body.data.id])
      expect(await ids(`date_from=${shift(-2)}&date_to=${shift(0)}`)).toEqual([p3.body.data.id, p2.body.data.id])
      expect(await ids('voided=false')).toEqual([p2.body.data.id, p1.body.data.id])
      expect(await ids('voided=true')).toEqual([p3.body.data.id])
      expect(await ids('q=alpha')).toEqual([p1.body.data.id])
      expect(await ids('q=bob')).toEqual([p2.body.data.id])
      expect(await ids('sort=amount')).toEqual([p1.body.data.id, p3.body.data.id, p2.body.data.id])
      const page = await request(app).get('/api/v1/payments?page_size=2&page=2').set(as('staff'))
      expect(page.body.meta).toMatchObject({ page: 2, total: 3, total_pages: 2 }); expect(page.body.data).toHaveLength(1)
      expect((await request(app).get('/api/v1/payments?bogus=1').set(as('staff'))).status).toBe(422)
      const first = (await request(app).get('/api/v1/payments').set(as('staff'))).body.data[0]
      expect(first).toEqual(expect.objectContaining({ customer: expect.any(Object), allocations: expect.any(Array), is_voided: true, void_reason: 'x' }))
    })
    it('detail and invoice history return allocations; unknown ids give 404', async () => {
      const id = await inv()
      const p = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }] })
      const d = await request(app).get(`/api/v1/payments/${p.body.data.id}`).set(as('staff'))
      expect(d.status).toBe(200); expect(d.body.data.allocations[0]).toMatchObject({ invoice_id: id, amount: '10.00' })
      expect((await request(app).get('/api/v1/payments/99999').set(as('staff'))).status).toBe(404)
      expect((await request(app).get('/api/v1/invoices/99999/payments').set(as('staff'))).status).toBe(404)
      expect((await request(app).get('/api/v1/invoices/abc/payments').set(as('staff'))).status).toBe(422)
    })
  })

  describe('customer outstanding / overdue totals (F04 contract)', () => {
    it('customer detail reports totals from confirmed unpaid invoices and ignores voided payments', async () => {
      const overdue = await inv({ issueDate: shift(-40), dueDate: shift(-20) })
      const future = await inv({ lines: [{ quantity: 1, unit_price: '50.00', tax_name: null }] })
      await inv({ status: 'draft' }); await inv({ status: 'cancelled' }); await inv({ status: 'paid' })
      const get = async () => (await request(app).get(`/api/v1/customers/${customerId}`).set(as('staff'))).body.data
      expect(await get()).toMatchObject({ outstanding_amount: '150.00', overdue_amount: '100.00' })
      const p = await pay({ amount: '40.00', allocations: [{ invoice_id: overdue, amount: '40.00' }] })
      expect(await get()).toMatchObject({ outstanding_amount: '110.00', overdue_amount: '60.00' })
      await request(app).post(`/api/v1/payments/${p.body.data.id}/void`).set(as('admin')).send({ reason: 'x' })
      expect(await get()).toMatchObject({ outstanding_amount: '150.00', overdue_amount: '100.00' })
      await pay({ amount: '50.00', allocations: [{ invoice_id: future, amount: '50.00' }], method: 'upi' })
      expect(await get()).toMatchObject({ outstanding_amount: '100.00', overdue_amount: '100.00' })
    })
    it('a customer with no invoices reports zero', async () => {
      const d = (await request(app).get(`/api/v1/customers/${otherCustomerId}`).set(as('admin'))).body.data
      expect(d).toMatchObject({ outstanding_amount: '0.00', overdue_amount: '0.00' })
    })
  })

  describe('authorization', () => {
    it('401 anonymous, 403 customer on every endpoint; staff may not void', async () => {
      const id = await inv()
      const p = await pay({ amount: '10.00', allocations: [{ invoice_id: id, amount: '10.00' }] })
      const pid = p.body.data.id
      const calls: Array<['get' | 'post', string, object?]> = [
        ['get', '/api/v1/payments'], ['post', '/api/v1/payments', {}], ['get', `/api/v1/payments/${pid}`],
        ['post', `/api/v1/payments/${pid}/void`, { reason: 'x' }], ['get', `/api/v1/invoices/${id}/payments`],
      ]
      for (const [m, url, b] of calls) {
        expect((await request(app)[m](url).send(b)).status, `anon ${url}`).toBe(401)
        expect((await request(app)[m](url).set(as('alice')).send(b)).status, `customer ${url}`).toBe(403)
      }
      const staffVoid = await request(app).post(`/api/v1/payments/${pid}/void`).set(as('staff')).send({ reason: 'x' })
      expect(staffVoid.status).toBe(403)
      expect((await pool.query('SELECT voided_at FROM payments WHERE id=$1', [pid])).rows[0].voided_at).toBeNull()
      for (const who of ['admin', 'staff']) {
        expect((await request(app).get('/api/v1/payments').set(as(who))).status).toBe(200)
        expect((await request(app).get(`/api/v1/payments/${pid}`).set(as(who))).status).toBe(200)
        expect((await request(app).get(`/api/v1/invoices/${id}/payments`).set(as(who))).status).toBe(200)
      }
      expect((await pay({ amount: '5.00', allocations: [{ invoice_id: id, amount: '5.00' }], method: 'cash' }, 'admin')).status).toBe(201)
    })
  })
})
