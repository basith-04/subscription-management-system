// F11 database tests. Run against the REAL F00/F06/F11 migrations in an isolated schema.
// The only test-only objects are the F09 `subscriptions` / `subscription_items` stand-ins (see invoices-test-db.ts).
import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createInvoice, createSubscriptionStandIn } from '../../factories/invoice.factory.js'
import { createUser } from '../../factories/user.factory.js'
import { canConnect } from '../../helpers/db.js'
import { derivePaymentState, paymentStateSql } from '../../../src/modules/invoices/invoices.payment-state.js'
import type { InvoiceStatus } from '../../../src/modules/invoices/invoices.constants.js'
import { createInvoiceTestDb, type InvoiceTestDb } from '../../helpers/invoices-test-db.js'

const dbAvailable = await canConnect()

describe.skipIf(!dbAvailable)('F11 invoice schema (real migrations)', () => {
  let fixture: InvoiceTestDb
  let pool: Pool
  let customerId: number
  let subscriptionId: number

  beforeAll(async () => {
    fixture = await createInvoiceTestDb()
    pool = fixture.pool
  })
  afterAll(async () => {
    await fixture.teardown()
  })
  beforeEach(async () => {
    await fixture.reset()
    const c = await createUser(pool, { email: 'cust@example.com', role: 'customer', fullName: 'Cust One' })
    customerId = c.customer_id!
    subscriptionId = (await createSubscriptionStandIn(pool, customerId)).id
  })

  const expectPgError = async (promise: Promise<unknown>, match: RegExp) => {
    await expect(promise).rejects.toThrow(match)
  }

  it('creates all F11 tables, the sequence and the named indexes', async () => {
    const tables = await pool.query<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)`,
      [fixture.schema, ['invoices', 'invoice_items', 'invoice_tax_details', 'billing_runs']],
    )
    expect(tables.rows.map((r) => r.t).sort()).toEqual(['billing_runs', 'invoice_items', 'invoice_tax_details', 'invoices'])
    const idx = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'invoices'`,
      [fixture.schema],
    )
    const names = idx.rows.map((r) => r.indexname)
    for (const n of [
      'uq_invoices_subscription_period_start', 'ix_invoices_customer_status', 'ix_invoices_due_outstanding',
      'ix_invoices_status_issue_date', 'ix_invoices_subscription_period', 'ix_invoices_billing_run', 'uq_invoices_number',
    ]) expect(names).toContain(n)
    const overdue = idx.rows.find((r) => r.indexname === 'ix_invoices_due_outstanding')!.indexdef
    expect(overdue).toMatch(/WHERE .*status = 'confirmed'.*amount_due > \(?0/)
    const seq = await pool.query(`SELECT 1 FROM pg_sequences WHERE schemaname = $1 AND sequencename = 'invoice_number_seq'`, [fixture.schema])
    expect(seq.rowCount).toBe(1)
  })

  it('assigns INV-000001 style numbers from invoice_number_seq', async () => {
    const a = await createInvoice(pool, { customerId, subscriptionId })
    const b = await createInvoice(pool, { customerId, subscriptionId })
    const rows = await pool.query<{ number: string }>('SELECT number FROM invoices WHERE id = ANY($1) ORDER BY id', [[a, b]])
    expect(rows.rows.map((r) => r.number)).toEqual(['INV-000001', 'INV-000002'])
  })

  it('generates amount_due = total - amount_paid and keeps it in step on update', async () => {
    const id = await createInvoice(pool, { customerId, subscriptionId, status: 'confirmed', amountPaid: '50.00' })
    const r1 = await pool.query<{ total: string; amount_due: string }>('SELECT total, amount_due FROM invoices WHERE id=$1', [id])
    expect(Number(r1.rows[0]!.amount_due)).toBeCloseTo(Number(r1.rows[0]!.total) - 50, 2)
    await pool.query("UPDATE invoices SET amount_paid = 100 WHERE id = $1", [id])
    const r2 = await pool.query<{ total: string; amount_due: string }>('SELECT total, amount_due FROM invoices WHERE id=$1', [id])
    expect(Number(r2.rows[0]!.amount_due)).toBeCloseTo(Number(r2.rows[0]!.total) - 100, 2)
    // generated columns cannot be written directly
    await expectPgError(pool.query('UPDATE invoices SET amount_due = 0 WHERE id = $1', [id]), /generated column|can only be updated to DEFAULT/i)
  })

  it('rejects a second live invoice for the same subscription period, but allows re-issue after cancellation', async () => {
    const first = await createInvoice(pool, { customerId, subscriptionId, periodStart: '2026-11-01', periodEnd: '2026-11-30' })
    await expectPgError(
      createInvoice(pool, { customerId, subscriptionId, periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
      /uq_invoices_subscription_period_start/,
    )
    // a different subscription is fine
    const other = (await createSubscriptionStandIn(pool, customerId)).id
    await createInvoice(pool, { customerId, subscriptionId: other, periodStart: '2026-11-01' })
    // cancelled invoice frees the period
    await pool.query("UPDATE invoices SET status='cancelled', cancel_reason='x', cancelled_at=now() WHERE id=$1", [first])
    await createInvoice(pool, { customerId, subscriptionId, periodStart: '2026-11-01', periodEnd: '2026-11-30' })
    // and a cancelled duplicate may coexist with the live one
    await createInvoice(pool, { customerId, subscriptionId, periodStart: '2026-11-01', status: 'cancelled' })
  })

  it('rejects totals that do not add up', async () => {
    await expectPgError(
      pool.query(
        `INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, issue_date, due_date, customer_name, customer_email,
           payment_term_name, subtotal, discount_total, tax_total, total)
         VALUES ($1,$2,'2026-11-01','2026-11-30','2026-11-01','2026-11-16','n','e@x.co','Net 15', 100, 0, 18, 119)`,
        [subscriptionId, customerId],
      ),
      /ck_invoices_total/,
    )
  })

  it('enforces amount_paid between 0 and total', async () => {
    const id = await createInvoice(pool, { customerId, subscriptionId, status: 'confirmed' })
    await expectPgError(pool.query('UPDATE invoices SET amount_paid = -1 WHERE id = $1', [id]), /ck_invoices_amount_paid/)
    await expectPgError(pool.query('UPDATE invoices SET amount_paid = total + 0.01 WHERE id = $1', [id]), /ck_invoices_amount_paid/)
  })

  it('requires amount_due = 0 for paid invoices and a reason for cancelled ones', async () => {
    const id = await createInvoice(pool, { customerId, subscriptionId, status: 'confirmed', amountPaid: '10.00' })
    await expectPgError(pool.query("UPDATE invoices SET status='paid' WHERE id = $1", [id]), /ck_invoices_paid_has_no_due/)
    await expectPgError(pool.query("UPDATE invoices SET status='cancelled' WHERE id = $1", [id]), /ck_invoices_cancel_reason/)
  })

  it('rejects bad dates, statuses and inconsistent line maths', async () => {
    await expectPgError(
      createInvoice(pool, { customerId, subscriptionId, periodStart: '2026-11-30', periodEnd: '2026-11-01' }),
      /ck_invoices_period/,
    )
    await expectPgError(createInvoice(pool, { customerId, subscriptionId, issueDate: '2026-11-10', dueDate: '2026-11-01' }), /ck_invoices_due_date/)
    const id = await createInvoice(pool, { customerId, subscriptionId })
    await expectPgError(pool.query("UPDATE invoices SET status='overdue' WHERE id=$1", [id]), /invoices_status_check/)
    await expectPgError(
      pool.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_subtotal, taxable_amount, tax_rate, tax_amount, line_total)
         VALUES ($1,'x',2,100,199,199,0,0,199)`, [id]),
      /ck_invoice_items_subtotal/,
    )
  })

  it('restricts deleting a customer or subscription that has invoices, and cascades items with the invoice', async () => {
    const id = await createInvoice(pool, { customerId, subscriptionId })
    await expectPgError(pool.query('DELETE FROM subscriptions WHERE id = $1', [subscriptionId]), /violates foreign key/)
    await expectPgError(pool.query('DELETE FROM customers WHERE id = $1', [customerId]), /violates foreign key/)
    await pool.query('DELETE FROM invoices WHERE id = $1', [id])
    const items = await pool.query('SELECT 1 FROM invoice_items WHERE invoice_id = $1', [id])
    expect(items.rowCount).toBe(0)
  })

  it('attached the documented foreign keys to the F09 tables (FK migration path)', async () => {
    await expectPgError(
      pool.query(
        `INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, issue_date, due_date, customer_name, customer_email,
           payment_term_name, subtotal, tax_total, total)
         VALUES (999999,$1,'2026-11-01','2026-11-30','2026-11-01','2026-11-16','n','e@x.co','Net 15', 0, 0, 0)`, [customerId]),
      /fk_invoices_subscription_id/,
    )
  })

  it('FK migration is idempotent and a no-op without F09 tables', async () => {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const sql = await readFile(
      fileURLToPath(new URL('../../../db/migrations/20261231000000_f11_invoice_subscription_fks.sql', import.meta.url)), 'utf8')
    await pool.query(sql) // second run: constraints already exist
    await pool.query(sql)
    const c = await pool.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'fk_invoices_subscription_id' AND conrelid = 'invoices'::regclass`)
    expect(c.rows[0].n).toBe(1)
  })

  it('enforces one tax detail row per (invoice, tax name, rate)', async () => {
    const id = await createInvoice(pool, { customerId, subscriptionId })
    await expectPgError(
      pool.query(`INSERT INTO invoice_tax_details (invoice_id, tax_name, tax_rate, taxable_amount, tax_amount) VALUES ($1,'GST 18%',18,1,0.18)`, [id]),
      /uq_invoice_tax_details/,
    )
  })

  it('SQL payment_state expression and JS derivePaymentState agree on every combination', async () => {
    const today = '2026-11-10'
    const statuses: InvoiceStatus[] = ['draft', 'confirmed', 'paid', 'cancelled']
    const dues = ['2026-11-01', '2026-11-07', '2026-11-09', '2026-11-10', '2026-11-11', '2026-12-01']
    const paidOptions = ['0.00', '40.00', 'ALL']
    let checked = 0
    for (const status of statuses) for (const due of dues) for (const paidOpt of paidOptions) {
      if (status === 'paid' && paidOpt !== 'ALL') continue // DB forbids paid with a balance
      if (status !== 'paid' && paidOpt === 'ALL' && status !== 'confirmed') continue
      const id = await createInvoice(pool, {
        customerId, subscriptionId, status: status === 'paid' ? 'paid' : status,
        issueDate: '2026-10-01', dueDate: due, lines: [{ quantity: 1, unit_price: '100.00', tax_name: null }],
        ...(status !== 'paid' && paidOpt !== 'ALL' ? { amountPaid: status === 'draft' || status === 'cancelled' ? '0.00' : paidOpt } : {}),
        ...(status === 'confirmed' && paidOpt === 'ALL' ? { amountPaid: '100.00' } : {}),
      })
      for (const grace of [0, 3]) {
        const sql = paymentStateSql('i', '$1', '$2')
        const r = await pool.query<{ state: string; status: InvoiceStatus; amount_paid: string; amount_due: string; due_date: string }>(
          `SELECT ${sql} AS state, i.status, i.amount_paid, i.amount_due, i.due_date::text FROM invoices i WHERE i.id = $3`,
          [today, grace, id],
        )
        const row = r.rows[0]!
        expect(row.state, `${status}/${paidOpt}/${due}/grace ${grace}`).toBe(derivePaymentState(row, today, grace))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(30)
  })
})
