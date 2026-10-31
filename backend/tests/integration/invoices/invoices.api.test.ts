// F11 API tests. Real F00/F05/F06/F11 migrations in an isolated schema; invoices and the F09 `subscriptions`
// rows come from TEST FACTORIES (F12 / F09 are not merged). Mail is a stub transport.
import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBillingRun, createInvoice, createSubscriptionStandIn } from '../../factories/invoice.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { createTestApp } from '../../helpers/app.js'
import { cookiePair } from '../../helpers/cookies.js'
import { canConnect } from '../../helpers/db.js'
import { createInvoiceTestDb, type InvoiceTestDb } from '../../helpers/invoices-test-db.js'
import { todayInBusinessTimezone } from '../../../src/modules/invoices/invoices.payment-state.js'

const dbAvailable = await canConnect()
const PASSWORD = 'Example!Pass123'
const API = '/api/v1/invoices'

const shift = (days: number) => {
  const d = new Date(`${todayInBusinessTimezone()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!dbAvailable)('F11 invoices API', () => {
  let fixture: InvoiceTestDb
  let pool: Pool
  let app: Express
  const cookies: Record<string, string> = {}
  let customerId: number
  let subscriptionId: number
  const sendMail = vi.fn()

  const as = (key: string) => ({ Cookie: cookies[key] ?? '' })
  async function loginAs(key: string, email: string) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })
    expect(res.status).toBe(200)
    cookies[key] = cookiePair(res)
  }
  const mk = (o: Partial<Parameters<typeof createInvoice>[1]> = {}) =>
    createInvoice(pool, { customerId, subscriptionId, ...o })
  const auditActions = async (id: number) =>
    (await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_type='invoice' AND entity_id=$1 ORDER BY id", [id])).rows.map((r) => r.action)
  const statusOf = async (id: number) =>
    (await pool.query<{ status: string }>('SELECT status FROM invoices WHERE id=$1', [id])).rows[0]!.status

  beforeAll(async () => {
    fixture = await createInvoiceTestDb()
    pool = fixture.pool
    app = createTestApp(pool)
    ;(app.locals as { mailer?: unknown }).mailer = { sendMail }
  })
  afterAll(async () => {
    await fixture.teardown()
  })
  beforeEach(async () => {
    await fixture.reset()
    sendMail.mockReset().mockResolvedValue({ ok: true })
    await createUser(pool, { email: 'admin@example.com', role: 'admin' })
    await createUser(pool, { email: 'staff@example.com', role: 'staff' })
    const c = await createUser(pool, { email: 'alice@example.com', role: 'customer', fullName: 'Alice Customer' })
    customerId = c.customer_id!
    subscriptionId = (await createSubscriptionStandIn(pool, customerId, 'SUB-000055')).id
    await loginAs('admin', 'admin@example.com')
    await loginAs('staff', 'staff@example.com')
    await loginAs('alice', 'alice@example.com')
  })

  describe('authorization', () => {
    it('401 without a session; 403 for customers on every endpoint', async () => {
      const id = await mk()
      const calls: Array<[string, string, object?]> = [
        ['get', API], ['get', `${API}/${id}`], ['patch', `${API}/${id}`, { notes: 'x' }],
        ['post', `${API}/${id}/confirm`], ['post', `${API}/bulk-confirm`, { invoice_ids: [id] }],
        ['post', `${API}/${id}/cancel`, { reason: 'x' }], ['post', `${API}/${id}/send`, {}], ['get', `${API}/${id}/print`],
      ]
      for (const [method, url, body] of calls) {
        const anon = await (request(app) as any)[method](url).send(body)
        expect(anon.status, `anon ${method} ${url}`).toBe(401)
        const cust = await (request(app) as any)[method](url).set(as('alice')).send(body)
        expect(cust.status, `customer ${method} ${url}`).toBe(403)
      }
      expect(await statusOf(id)).toBe('draft')
    })

    it('admin and staff can read and manage', async () => {
      const a = await mk()
      const b = await mk()
      expect((await request(app).get(API).set(as('staff'))).status).toBe(200)
      expect((await request(app).get(`${API}/${a}`).set(as('admin'))).status).toBe(200)
      expect((await request(app).post(`${API}/${a}/confirm`).set(as('staff'))).status).toBe(200)
      expect((await request(app).post(`${API}/${b}/cancel`).set(as('admin')).send({ reason: 'dup' })).status).toBe(200)
    })

    it('does not expose creation or F13/F14 routes', async () => {
      expect((await request(app).post(API).set(as('admin')).send({ subscription_id: 1, period_start: '2026-11-01' })).status).toBe(404)
      expect((await request(app).get(`${API}/1/payments`).set(as('admin'))).status).toBe(404)
      expect((await request(app).get('/api/v1/me/invoices').set(as('alice'))).status).toBe(404)
    })
  })

  describe('detail and snapshots', () => {
    it('returns header, snapshot customer, subscription, lines, tax details and totals', async () => {
      const id = await mk({
        status: 'confirmed', amountPaid: '50.00', periodStart: '2026-11-01', periodEnd: '2026-11-30',
        issueDate: '2026-11-01', dueDate: shift(30), customerTaxId: 'GSTIN-1',
        billingAddress: { line1: '1 Main St', city: 'Kochi', country: 'India' },
        lines: [{ description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', discount: '780.00' }],
      })
      const res = await request(app).get(`${API}/${id}`).set(as('staff'))
      expect(res.status).toBe(200)
      const d = res.body.data
      expect(d).toMatchObject({
        id, number: 'INV-000001', status: 'confirmed', payment_state: 'partially_paid',
        subscription: { id: subscriptionId, number: 'SUB-000055' },
        customer: { id: customerId, name: 'Alice Customer', email: 'alice@example.com', tax_id: 'GSTIN-1', billing_address: { city: 'Kochi' } },
        period_start: '2026-11-01', period_end: '2026-11-30', issue_date: '2026-11-01', payment_term: 'Net 15',
        subtotal: '7800.00', discount_total: '780.00', tax_total: '1263.60', total: '8283.60',
        amount_paid: '50.00', amount_due: '8233.60', sent_at: null,
        can_edit: false, can_confirm: false, can_cancel: false, can_send: true,
      })
      expect(d.items).toEqual([expect.objectContaining({
        description: 'Platform – Brand: Odoo', quantity: 5, unit_price: '1560.00', line_subtotal: '7800.00',
        discount_amount: '780.00', taxable_amount: '7020.00', tax_rate: '18.000', tax_amount: '1263.60', line_total: '8283.60',
      })])
      expect(d.tax_details).toEqual([{ tax_name: 'GST 18%', tax_rate: '18.000', taxable_amount: '7020.00', tax_amount: '1263.60' }])
    })

    it('keeps showing the invoice snapshot after the customer profile changes', async () => {
      const id = await mk({ status: 'confirmed', billingAddress: { line1: 'Old Street' } })
      await pool.query("UPDATE customers SET name='Renamed Corp', email='new@example.com', city='Elsewhere' WHERE id=$1", [customerId])
      const d = (await request(app).get(`${API}/${id}`).set(as('staff'))).body.data
      expect(d.customer).toMatchObject({ name: 'Alice Customer', email: 'alice@example.com', billing_address: { line1: 'Old Street' } })
      const html = (await request(app).get(`${API}/${id}/print`).set(as('staff'))).text
      expect(html).toContain('Alice Customer')
      expect(html).not.toContain('Renamed Corp')
    })

    it('404 for unknown ids and 422 for malformed ids', async () => {
      expect((await request(app).get(`${API}/99999`).set(as('staff'))).status).toBe(404)
      expect((await request(app).get(`${API}/abc`).set(as('staff'))).status).toBe(422)
    })
  })

  describe('list, filters and meta.summary', () => {
    beforeEach(async () => {
      const bob = (await createUser(pool, { email: 'bob@example.com', role: 'customer', fullName: 'Bob Builder' })).customer_id!
      const bobSub = (await createSubscriptionStandIn(pool, bob)).id
      await mk({ number: 'INV-100', status: 'draft', dueDate: shift(10), lines: [{ unit_price: '10.00', quantity: 1, tax_name: null }] })
      await mk({ number: 'INV-101', status: 'confirmed', issueDate: shift(-40), dueDate: shift(-20), lines: [{ unit_price: '100.00', quantity: 1, tax_name: null }] }) // overdue
      await mk({ number: 'INV-102', status: 'confirmed', issueDate: shift(-5), dueDate: shift(25), lines: [{ unit_price: '200.00', quantity: 1, tax_name: null }] }) // not_due
      await mk({ number: 'INV-103', status: 'confirmed', issueDate: shift(-5), dueDate: shift(25), amountPaid: '50.00', lines: [{ unit_price: '300.00', quantity: 1, tax_name: null }] }) // partially_paid
      await mk({ number: 'INV-104', status: 'paid', issueDate: shift(-60), dueDate: shift(-45), lines: [{ unit_price: '400.00', quantity: 1, tax_name: null }] })
      await mk({ number: 'INV-105', status: 'cancelled', lines: [{ unit_price: '500.00', quantity: 1, tax_name: null }] })
      await createInvoice(pool, { customerId: bob, subscriptionId: bobSub, number: 'INV-200', status: 'confirmed', issueDate: shift(-1), dueDate: shift(0), lines: [{ unit_price: '75.00', quantity: 1, tax_name: null }] }) // outstanding (due today)
    })

    const list = (qs = '') => request(app).get(`${API}${qs}`).set(as('staff'))
    const numbers = (res: request.Response) => (res.body.data as Array<{ number: string }>).map((r) => r.number).sort()

    it('lists with the documented item shape and payment_state values', async () => {
      const res = await list('?page_size=50')
      expect(res.status).toBe(200)
      expect(res.body.meta).toMatchObject({ page: 1, page_size: 50, total: 7, total_pages: 1 })
      const byNumber = Object.fromEntries(res.body.data.map((r: any) => [r.number, r.payment_state]))
      expect(byNumber).toEqual({
        'INV-100': 'draft', 'INV-101': 'overdue', 'INV-102': 'not_due', 'INV-103': 'partially_paid',
        'INV-104': 'paid', 'INV-105': 'cancelled', 'INV-200': 'outstanding',
      })
      expect(res.body.data[0]).toEqual(expect.objectContaining({
        id: expect.any(Number), number: expect.any(String), customer: { id: expect.any(Number), name: expect.any(String) },
        status: expect.any(String), issue_date: expect.any(String), due_date: expect.any(String),
        total: expect.stringMatching(/^\d+\.\d{2}$/), amount_paid: expect.any(String), amount_due: expect.any(String),
      }))
    })

    it('filters by status, payment_state (incl. lists), customer, subscription and q', async () => {
      expect(numbers(await list('?status=draft'))).toEqual(['INV-100'])
      expect(numbers(await list('?payment_state=overdue'))).toEqual(['INV-101'])
      expect(numbers(await list('?payment_state=overdue,partially_paid'))).toEqual(['INV-101', 'INV-103'])
      expect(numbers(await list('?payment_state=not_due,outstanding,partially_paid,overdue'))).toEqual(['INV-101', 'INV-102', 'INV-103', 'INV-200'])
      expect(numbers(await list(`?subscription_id=${subscriptionId}&status=paid`))).toEqual(['INV-104'])
      expect(numbers(await list('?q=bob'))).toEqual(['INV-200'])
      expect(numbers(await list('?q=inv-10'))).toEqual(['INV-100', 'INV-101', 'INV-102', 'INV-103', 'INV-104', 'INV-105'])
      expect(numbers(await list('?q=%25'))).toEqual([]) // wildcards are literal
      expect((await list('?customer_id=99999')).body.meta.total).toBe(0)
    })

    it('filters by issue/due date and total ranges', async () => {
      expect(numbers(await list(`?due_from=${shift(-30)}&due_to=${shift(-10)}&status=confirmed`))).toEqual(['INV-101'])
      expect(numbers(await list(`?issue_from=${shift(-6)}&issue_to=${shift(-4)}`))).toEqual(['INV-102', 'INV-103'])
      expect(numbers(await list('?min_total=200.00&max_total=300.00'))).toEqual(['INV-102', 'INV-103'])
    })

    it('sorts and paginates', async () => {
      const asc = await list('?sort=total&page_size=3')
      expect(asc.body.data.map((r: any) => r.number)).toEqual(['INV-100', 'INV-200', 'INV-101'])
      expect(asc.body.meta).toMatchObject({ total: 7, total_pages: 3 })
      const desc = await list('?sort=-total&page_size=3&page=2')
      expect(desc.body.data.map((r: any) => r.number)).toEqual(['INV-102', 'INV-101', 'INV-200'])
      expect((await list('?page=99')).body.data).toEqual([])
    })

    it('rejects unknown filters, sort fields and bad values with 422', async () => {
      for (const qs of ['?bogus=1', '?sort=amount_due', '?status=overdue', '?payment_state=late', '?issue_from=nope', '?page_size=101']) {
        expect((await list(qs)).status, qs).toBe(422)
      }
    })

    it('meta.summary equals a direct SQL aggregate for the same filter', async () => {
      const cases: Array<[string, string, unknown[]]> = [
        ['', '', []],
        ['?status=confirmed', "WHERE status = 'confirmed'", []],
        ['?payment_state=not_due,outstanding,partially_paid,overdue', "WHERE status = 'confirmed' AND amount_due > 0", []],
        ['?customer_id=' + customerId, 'WHERE customer_id = $1', [customerId]],
        ['?min_total=100.00', 'WHERE total >= 100', []],
      ]
      for (const [qs, where, params] of cases) {
        const res = await list(qs ? qs + '&page_size=1' : '?page_size=1')
        const direct = await pool.query<{ count: string; total: string; paid: string; due: string }>(
          `SELECT count(*)::text AS count,
                  COALESCE(sum(total) FILTER (WHERE status IN ('confirmed','paid')),0)::text AS total,
                  COALESCE(sum(amount_paid) FILTER (WHERE status IN ('confirmed','paid')),0)::text AS paid,
                  COALESCE(sum(amount_due) FILTER (WHERE status = 'confirmed'),0)::text AS due
             FROM invoices ${where}`, params)
        const s = res.body.meta.summary
        const dd = direct.rows[0]!
        expect(s.count, qs).toBe(Number(dd.count))
        expect(Number(s.total), qs).toBeCloseTo(Number(dd.total), 2)
        expect(Number(s.amount_paid), qs).toBeCloseTo(Number(dd.paid), 2)
        expect(Number(s.amount_due), qs).toBeCloseTo(Number(dd.due), 2)
        expect(s.total).toMatch(/^\d+\.\d{2}$/)
        expect(res.body.meta.total).toBe(Number(dd.count))
      }
    })

    it('summary ignores pagination and reports zeros for an empty result', async () => {
      const page2 = await list('?page_size=1&page=3')
      const full = await list('?page_size=100')
      expect(page2.body.meta.summary).toEqual(full.body.meta.summary)
      expect((await list('?customer_id=424242')).body.meta.summary).toEqual({ count: 0, total: '0.00', amount_paid: '0.00', amount_due: '0.00' })
    })
  })

  describe('draft editing', () => {
    it('edits due date, notes and removes a line, recomputing totals and tax summary', async () => {
      const id = await mk({
        issueDate: '2026-11-01', dueDate: '2026-11-16',
        lines: [{ description: 'A', quantity: 1, unit_price: '100.00' }, { description: 'B', quantity: 1, unit_price: '50.00', tax_name: null }],
      })
      const before = (await request(app).get(`${API}/${id}`).set(as('staff'))).body.data
      expect(before.total).toBe('168.00')
      const lineB = before.items.find((i: any) => i.description === 'B').id
      const res = await request(app).patch(`${API}/${id}`).set(as('staff')).send({ due_date: '2026-12-01', notes: 'Thanks <3', remove_item_ids: [lineB] })
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ due_date: '2026-12-01', notes: 'Thanks <3', subtotal: '100.00', tax_total: '18.00', total: '118.00', amount_due: '118.00' })
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.tax_details).toEqual([expect.objectContaining({ taxable_amount: '100.00', tax_amount: '18.00' })])
      expect(await auditActions(id)).toEqual(['invoice.update'])
    })

    it('rejects an empty change, unknown fields, financial fields and bad dates (422)', async () => {
      const id = await mk({ issueDate: '2026-11-10', dueDate: '2026-11-20' })
      for (const body of [{}, { total: '1.00' }, { status: 'paid' }, { amount_paid: '5.00' }, { customer_name: 'x' }, { due_date: '2026-11-09' }, { due_date: 'soon' }]) {
        expect((await request(app).patch(`${API}/${id}`).set(as('staff')).send(body)).status, JSON.stringify(body)).toBe(422)
      }
      const total = (await pool.query<{ total: string }>('SELECT total FROM invoices WHERE id=$1', [id])).rows[0]!.total
      expect(total).toBe('236.00')
    })

    it('refuses removing foreign lines or every line (422) and leaves the invoice untouched', async () => {
      const id = await mk()
      const other = await mk()
      const otherItem = (await pool.query<{ id: string }>('SELECT id FROM invoice_items WHERE invoice_id=$1', [other])).rows[0]!.id
      const own = (await pool.query<{ id: string }>('SELECT id FROM invoice_items WHERE invoice_id=$1', [id])).rows[0]!.id
      expect((await request(app).patch(`${API}/${id}`).set(as('staff')).send({ remove_item_ids: [Number(otherItem)] })).status).toBe(422)
      expect((await request(app).patch(`${API}/${id}`).set(as('staff')).send({ remove_item_ids: [Number(own)] })).status).toBe(422)
      expect((await pool.query('SELECT 1 FROM invoice_items WHERE invoice_id IN ($1,$2)', [id, other])).rowCount).toBe(2)
    })

    it.each(['confirmed', 'paid', 'cancelled'] as const)('409 INVALID_STATE_TRANSITION when the invoice is %s', async (status) => {
      const id = await mk({ status })
      const res = await request(app).patch(`${API}/${id}`).set(as('staff')).send({ notes: 'late edit' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect((await pool.query('SELECT notes FROM invoices WHERE id=$1', [id])).rows[0].notes).toBeNull()
    })
  })

  describe('confirm', () => {
    it('confirms a draft, stamps confirmed_at, locks lines and audits', async () => {
      const id = await mk()
      const res = await request(app).post(`${API}/${id}/confirm`).set(as('staff'))
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ status: 'confirmed', can_edit: false, can_confirm: false, can_cancel: true })
      expect(res.body.data.confirmed_at).toEqual(expect.any(String))
      expect(await auditActions(id)).toEqual(['invoice.confirm'])
      expect((await request(app).patch(`${API}/${id}`).set(as('staff')).send({ notes: 'x' })).status).toBe(409)
    })

    it('second confirm is 409 and writes no extra audit row', async () => {
      const id = await mk()
      expect((await request(app).post(`${API}/${id}/confirm`).set(as('staff'))).status).toBe(200)
      const again = await request(app).post(`${API}/${id}/confirm`).set(as('admin'))
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(await auditActions(id)).toEqual(['invoice.confirm'])
    })

    it('concurrent confirms: exactly one wins', async () => {
      const id = await mk()
      const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post(`${API}/${id}/confirm`).set(as('staff'))))
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.filter((r) => r.status === 409)).toHaveLength(4)
      expect(await auditActions(id)).toEqual(['invoice.confirm'])
    })

    it('concurrent confirm vs cancel never corrupts state or returns a server error', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await mk()
        const [c, x] = await Promise.all([
          request(app).post(`${API}/${id}/confirm`).set(as('staff')),
          request(app).post(`${API}/${id}/cancel`).set(as('admin')).send({ reason: 'race' }),
        ])
        expect(x.status).toBe(200) // cancel is valid from draft and from unpaid confirmed
        expect([200, 409]).toContain(c.status)
        expect(await statusOf(id)).toBe('cancelled')
        const actions = await auditActions(id)
        expect(actions).toContain('invoice.cancel')
        expect(actions.filter((a) => a === 'invoice.cancel')).toHaveLength(1)
        if (c.status === 409) expect(actions).not.toContain('invoice.confirm')
      }
    })

    it.each(['paid', 'cancelled'] as const)('409 for a %s invoice', async (status) => {
      const id = await mk({ status })
      expect((await request(app).post(`${API}/${id}/confirm`).set(as('staff'))).status).toBe(409)
    })

    it('422 and rolled back when the invoice has no lines', async () => {
      const id = await mk()
      await pool.query('DELETE FROM invoice_items WHERE invoice_id=$1', [id])
      const res = await request(app).post(`${API}/${id}/confirm`).set(as('staff'))
      expect(res.status).toBe(422)
      expect(await statusOf(id)).toBe('draft')
      expect(await auditActions(id)).toEqual([])
    })

    it('422 and rolled back when header totals do not match the lines', async () => {
      const id = await mk()
      await pool.query('DELETE FROM invoice_items WHERE invoice_id=$1 AND id = (SELECT min(id) FROM invoice_items WHERE invoice_id=$1)', [id])
      await pool.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_subtotal, taxable_amount, tax_rate, tax_amount, line_total)
         VALUES ($1,'other',1,1.00,1.00,1.00,0,0,1.00)`, [id])
      const res = await request(app).post(`${API}/${id}/confirm`).set(as('staff'))
      expect(res.status).toBe(422)
      expect(await statusOf(id)).toBe('draft')
    })

    it('404 for an unknown invoice', async () => {
      expect((await request(app).post(`${API}/99999/confirm`).set(as('staff'))).status).toBe(404)
    })
  })

  describe('bulk confirm', () => {
    it('reports partial success per invoice for mixed states and unknown ids', async () => {
      const d1 = await mk(); const d2 = await mk()
      const paid = await mk({ status: 'paid' }); const cancelled = await mk({ status: 'cancelled' })
      const bad = await mk(); await pool.query('DELETE FROM invoice_items WHERE invoice_id=$1', [bad])
      const res = await request(app).post(`${API}/bulk-confirm`).set(as('staff')).send({ invoice_ids: [d1, paid, d2, cancelled, bad, 987654, d1] })
      expect(res.status).toBe(200)
      expect(res.body.data.confirmed.sort()).toEqual([d1, d2].sort())
      const failed = Object.fromEntries(res.body.data.failed.map((f: any) => [f.id, f.code]))
      expect(failed).toEqual({ [paid]: 'INVALID_STATE_TRANSITION', [cancelled]: 'INVALID_STATE_TRANSITION', [bad]: 'VALIDATION_ERROR', 987654: 'NOT_FOUND' })
      expect(await statusOf(d1)).toBe('confirmed'); expect(await statusOf(d2)).toBe('confirmed')
      expect(await statusOf(bad)).toBe('draft')
      expect(await auditActions(d1)).toEqual(['invoice.confirm'])
    })

    it('confirms all drafts of a billing run and leaves other invoices alone', async () => {
      const run = await createBillingRun(pool)
      const a = await mk({ billingRunId: run }); const b = await mk({ billingRunId: run })
      const done = await mk({ billingRunId: run, status: 'confirmed' })
      const outside = await mk()
      const res = await request(app).post(`${API}/bulk-confirm`).set(as('admin')).send({ billing_run_id: run })
      expect(res.status).toBe(200)
      expect(res.body.data.confirmed.sort()).toEqual([a, b].sort())
      expect(res.body.data.failed).toEqual([])
      expect(await statusOf(done)).toBe('confirmed')
      expect(await statusOf(outside)).toBe('draft')
      expect((await request(app).post(`${API}/bulk-confirm`).set(as('admin')).send({ billing_run_id: 424242 })).status).toBe(404)
    })

    it('enforces the 500 id cap and the selector rules (422)', async () => {
      const tooMany = Array.from({ length: 501 }, (_, i) => i + 1)
      const res = await request(app).post(`${API}/bulk-confirm`).set(as('staff')).send({ invoice_ids: tooMany })
      expect(res.status).toBe(422)
      for (const body of [{}, { invoice_ids: [] }, { invoice_ids: [1], billing_run_id: 2 }, { invoice_ids: ['x'] }]) {
        expect((await request(app).post(`${API}/bulk-confirm`).set(as('staff')).send(body)).status, JSON.stringify(body)).toBe(422)
      }
    })
  })

  describe('cancel', () => {
    it('cancels a draft with a reason, stamps cancelled_at and audits', async () => {
      const id = await mk()
      const res = await request(app).post(`${API}/${id}/cancel`).set(as('staff')).send({ reason: '  Duplicate  ' })
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ status: 'cancelled', payment_state: 'cancelled', cancel_reason: 'Duplicate', can_cancel: false, can_send: false })
      expect(res.body.data.cancelled_at).toEqual(expect.any(String))
      const audit = await pool.query("SELECT old_values, new_values FROM audit_logs WHERE entity_type='invoice' AND entity_id=$1", [id])
      expect(audit.rows[0].old_values).toEqual({ status: 'draft' })
      expect(audit.rows[0].new_values).toMatchObject({ status: 'cancelled', cancel_reason: 'Duplicate' })
    })

    it('cancels a confirmed invoice that has no payment (Staff and Admin)', async () => {
      const a = await mk({ status: 'confirmed' }); const b = await mk({ status: 'confirmed' })
      expect((await request(app).post(`${API}/${a}/cancel`).set(as('staff')).send({ reason: 'x' })).status).toBe(200)
      expect((await request(app).post(`${API}/${b}/cancel`).set(as('admin')).send({ reason: 'x' })).status).toBe(200)
    })

    it('requires a reason (422) and changes nothing without one', async () => {
      const id = await mk()
      for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }, { reason: 'ok', extra: 1 }]) {
        expect((await request(app).post(`${API}/${id}/cancel`).set(as('staff')).send(body)).status).toBe(422)
      }
      expect(await statusOf(id)).toBe('draft')
    })

    it('refuses a partially paid invoice for Staff and Admin with a "void the payment" hint', async () => {
      const id = await mk({ status: 'confirmed', amountPaid: '10.00' })
      const staff = await request(app).post(`${API}/${id}/cancel`).set(as('staff')).send({ reason: 'x' })
      expect(staff.status).toBe(409)
      expect(staff.body.error.code).toBe('INVALID_STATE_TRANSITION')
      expect(staff.body.error.message).toMatch(/Admin to void the payment/i)
      const admin = await request(app).post(`${API}/${id}/cancel`).set(as('admin')).send({ reason: 'x' })
      expect(admin.status).toBe(409)
      expect(admin.body.error.message).toMatch(/void the payment first/i)
      expect(await statusOf(id)).toBe('confirmed')
      expect(await auditActions(id)).toEqual([])
    })

    it.each(['paid', 'cancelled'] as const)('refuses a %s invoice with 409', async (status) => {
      const id = await mk({ status })
      const res = await request(app).post(`${API}/${id}/cancel`).set(as('admin')).send({ reason: 'x' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION')
    })

    it('frees the period so a deliberate re-issue is possible (partial unique index)', async () => {
      const id = await mk({ periodStart: '2026-12-01', periodEnd: '2026-12-31' })
      expect((await request(app).post(`${API}/${id}/cancel`).set(as('staff')).send({ reason: 'redo' })).status).toBe(200)
      await expect(mk({ periodStart: '2026-12-01', periodEnd: '2026-12-31' })).resolves.toEqual(expect.any(Number))
    })

    it('runs the discount-release hook inside the cancel transaction', async () => {
      const { invoiceHooks } = await import('../../../src/modules/invoices/invoices.hooks.js')
      const original = invoiceHooks.releaseDiscountRedemption
      const seen: number[] = []
      invoiceHooks.releaseDiscountRedemption = async (_tx, invoiceId) => { seen.push(invoiceId) }
      try {
        const id = await mk()
        expect((await request(app).post(`${API}/${id}/cancel`).set(as('staff')).send({ reason: 'x' })).status).toBe(200)
        expect(seen).toEqual([id])
        // a failing hook rolls the cancellation back
        invoiceHooks.releaseDiscountRedemption = async () => { throw new Error('boom') }
        const id2 = await mk()
        expect((await request(app).post(`${API}/${id2}/cancel`).set(as('staff')).send({ reason: 'x' })).status).toBe(500)
        expect(await statusOf(id2)).toBe('draft')
      } finally {
        invoiceHooks.releaseDiscountRedemption = original
      }
    })
  })

  describe('send', () => {
    it('emails the invoice to the customer snapshot email and sets sent_at only after success', async () => {
      const id = await mk({ status: 'confirmed', lines: [{ description: 'Pro plan', quantity: 2, unit_price: '100.00' }] })
      const res = await request(app).post(`${API}/${id}/send`).set(as('staff')).send({ message: 'Hello & thanks' })
      expect(res.status).toBe(200)
      expect(res.body.data.sent_at).toEqual(expect.any(String))
      expect(res.body.data.sent_to).toBe('alice@example.com')
      expect(sendMail).toHaveBeenCalledTimes(1)
      const mail = sendMail.mock.calls[0]![0]
      expect(mail.to).toBe('alice@example.com')
      expect(mail.subject).toContain('INV-000001')
      expect(mail.html).toContain('236.00')
      expect(mail.html).toContain('Pro plan')
      expect(mail.html).toContain('Hello &amp; thanks')
      expect(mail.text).toContain('Total: 236.00')
      expect(await auditActions(id)).toEqual(['invoice.send'])
    })

    it('sends to a custom recipient, and allows paid invoices', async () => {
      const id = await mk({ status: 'paid' })
      const res = await request(app).post(`${API}/${id}/send`).set(as('admin')).send({ to: 'Finance@Example.com' })
      expect(res.status).toBe(200)
      expect(sendMail.mock.calls[0]![0].to).toBe('finance@example.com')
      expect(res.body.data.sent_to).toBe('finance@example.com')
    })

    it.each(['draft', 'cancelled'] as const)('409 for a %s invoice and nothing is sent', async (status) => {
      const id = await mk({ status })
      const res = await request(app).post(`${API}/${id}/send`).set(as('staff')).send({})
      expect(res.status).toBe(409)
      expect(sendMail).not.toHaveBeenCalled()
    })

    it('422 for an invalid recipient or oversize message, nothing sent', async () => {
      const id = await mk({ status: 'confirmed' })
      for (const body of [{ to: 'nope' }, { to: 'a@b.co, c@d.co' }, { to: 'a@b.co\r\nBcc: x@y.z' }, { message: 'x'.repeat(1001) }, { cc: 'a@b.co' }]) {
        expect((await request(app).post(`${API}/${id}/send`).set(as('staff')).send(body)).status, JSON.stringify(body)).toBe(422)
      }
      expect(sendMail).not.toHaveBeenCalled()
    })

    it('502 EMAIL_FAILED on mail failure and the invoice stays unchanged', async () => {
      const id = await mk({ status: 'confirmed' })
      const before = (await pool.query('SELECT * FROM invoices WHERE id=$1', [id])).rows[0]
      sendMail.mockResolvedValueOnce({ ok: false, code: 'MAIL_DELIVERY_FAILED' })
      const res = await request(app).post(`${API}/${id}/send`).set(as('staff')).send({})
      expect(res.status).toBe(502)
      expect(res.body.error.code).toBe('EMAIL_FAILED')
      const after = (await pool.query('SELECT * FROM invoices WHERE id=$1', [id])).rows[0]
      expect(after).toEqual(before)
      expect(after.sent_at).toBeNull()
      expect(await auditActions(id)).toEqual([])
    })

    it('escapes hostile customer-controlled data in the email HTML', async () => {
      const id = await mk({
        status: 'confirmed', customerName: '<script>alert(1)</script>', customerTaxId: '"><img src=x onerror=1>',
        billingAddress: { line1: '<b>1</b> St' }, notes: '<iframe src=//evil></iframe>',
        lines: [{ description: '<svg onload=alert(1)>' }],
      })
      expect((await request(app).post(`${API}/${id}/send`).set(as('staff')).send({ message: '<script>m()</script>' })).status).toBe(200)
      const { html } = sendMail.mock.calls[0]![0]
      expect(html).not.toMatch(/<script|<iframe|<svg|<img|<b>/i)
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })
  })

  describe('print', () => {
    it('returns standalone HTML with snapshot data and totals', async () => {
      const id = await mk({
        status: 'confirmed', customerTaxId: 'GSTIN-9', notes: 'Pay by bank transfer',
        billingAddress: { line1: '1 Main St', city: 'Kochi', postal_code: '682001', country: 'India' },
        lines: [{ description: 'Platform', quantity: 5, unit_price: '1560.00', discount: '780.00' }],
      })
      const res = await request(app).get(`${API}/${id}/print?format=html`).set(as('staff'))
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(res.headers['cache-control']).toBe('no-store')
      for (const text of ['INV-000001', 'Alice Customer', 'alice@example.com', 'GSTIN-9', '1 Main St', 'Kochi, 682001', 'SUB-000055',
        'Platform', '7800.00', '780.00', '1263.60', '8283.60', 'Net 15', 'Pay by bank transfer', '@page']) {
        expect(res.text, text).toContain(text)
      }
      expect(res.text).not.toMatch(/<nav|<header class="app/i)
    })

    it('prints drafts (marked) and escapes hostile fields', async () => {
      const id = await mk({ customerName: 'A<script>x</script>', lines: [{ description: '</td><script>y</script>' }] })
      const res = await request(app).get(`${API}/${id}/print`).set(as('admin'))
      expect(res.status).toBe(200)
      expect(res.text).toContain('DRAFT')
      expect(res.text).not.toMatch(/<script/i)
    })

    it('404 for unknown invoices; 422 for unsupported formats (no PDF)', async () => {
      expect((await request(app).get(`${API}/99999/print`).set(as('staff'))).status).toBe(404)
      expect((await request(app).get(`${API}/1/print?format=pdf`).set(as('staff'))).status).toBe(422)
    })
  })
})
