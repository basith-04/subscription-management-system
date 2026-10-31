import { describe, expect, it } from 'vitest'
import { customerActions, displayStatus, toInvoiceDetail, toSubscriptionDetail } from '../../../src/modules/portal/portal.mappers.js'
import type { InvoiceDetailDto } from '../../../src/modules/invoices/index.js'
import type { SubscriptionRow } from '../../../src/modules/portal/portal.repository.js'
import { listMyInvoicesQuery, listMySubscriptionsQuery } from '../../../src/modules/portal/portal.schemas.js'

const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: '1', number: 'SUB-000001', status: 'active', start_date: '2026-01-01', expiry_date: '2026-12-31', quotation_valid_until: null,
  next_billing_date: '2026-12-01', paused_at: null, auto_renew: false, plan_id: '3', plan_name: 'Pro', billing_frequency: 'monthly',
  plan_is_active: true, allow_pause: true, allow_renewal: true, allow_early_close: true, payment_term_name: 'Net 15', ...over,
})
const today = '2026-11-10'

/** Deliberately hostile source objects: the mappers must drop every field they do not explicitly list. */
const LEAKY_KEYS = ['created_by', 'last_billing_error', 'template_id', 'customer_id', 'cost_price', 'notes_internal', 'audit', 'billing_run_id', 'sent_at',
  'cancel_reason', 'recorded_by', 'void_reason', 'note', 'can_edit', 'can_cancel', 'can_send', 'created_at', 'updated_at']
const keysDeep = (v: unknown, acc = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.add(k); keysDeep(x, acc) }
  return acc
}

describe('customerActions (plan policy + state)', () => {
  it('quotation: confirm only while valid (inclusive), never after expiry or for other states', () => {
    expect(customerActions(row({ status: 'quotation', quotation_valid_until: today }), today, true).can_confirm).toBe(true)
    expect(customerActions(row({ status: 'quotation', quotation_valid_until: '2026-11-09' }), today, true).can_confirm).toBe(false)
    expect(customerActions(row({ status: 'quotation', quotation_valid_until: null }), today, true).can_confirm).toBe(false)
    expect(customerActions(row({ status: 'confirmed' }), today, true).can_confirm).toBe(false)
  })
  it('active: pause / resume / renew / close follow the plan policy and paused flag', () => {
    expect(customerActions(row(), today, true)).toEqual({ can_confirm: false, can_pause: true, can_resume: false, can_renew: true, can_close: true })
    expect(customerActions(row({ paused_at: new Date() }), today, true)).toMatchObject({ can_pause: false, can_resume: true })
    expect(customerActions(row({ allow_pause: false, allow_renewal: false, allow_early_close: false }), today, true))
      .toMatchObject({ can_pause: false, can_renew: false, can_close: false })
    expect(customerActions(row({ plan_is_active: false }), today, true).can_renew).toBe(false)
    expect(customerActions(row({ status: 'closed' }), today, true)).toMatchObject({ can_pause: false, can_resume: false, can_renew: false, can_close: false })
  })
  it('F10 actions are all false while the lifecycle switch is off (no buttons without endpoints)', () => {
    expect(customerActions(row(), today, false)).toMatchObject({ can_pause: false, can_resume: false, can_renew: false, can_close: false })
  })
  it('display status for paused and expired quotations', () => {
    expect(displayStatus({ status: 'active', paused_at: new Date(), quotation_valid_until: null }, today)).toBe('Active (Paused)')
    expect(displayStatus({ status: 'quotation', paused_at: null, quotation_valid_until: '2026-11-01' }, today)).toBe('Quotation (expired)')
  })
})

describe('response mappers are allow-lists', () => {
  it('subscription detail contains no internal or cost fields even when the source row has them', () => {
    const hostile = { ...row(), created_by: '9', last_billing_error: 'boom', template_id: '4', customer_id: '2', cost_price: '1.00', audit: [{}] } as unknown as SubscriptionRow
    const out = toSubscriptionDetail(hostile, [{ id: '1', description: 'x', quantity: 2, unit_price: '10.00', line_amount: '20.00', tax_name: 'GST', tax_rate: '18.000', cost_price: '5' } as never], today, true)
    const keys = keysDeep(out)
    for (const k of LEAKY_KEYS) expect(keys.has(k), k).toBe(false)
    expect(out.totals).toEqual({ subtotal: '20.00', estimated_tax: '3.60', total: '23.60' })
  })
  it('invoice detail drops billing-run, sent, cancel reason, staff flags and payment internals', () => {
    const inv = {
      id: 1, number: 'INV-1', status: 'confirmed', payment_state: 'outstanding', subscription: { id: 2, number: 'SUB-2' }, billing_run_id: 5,
      customer: { id: 9, name: 'A', email: 'a@x.co', tax_id: null, billing_address: null }, period_start: '2026-01-01', period_end: '2026-01-31',
      issue_date: '2026-01-01', due_date: '2026-01-16', payment_term: 'Net 15', notes: null, items: [], tax_details: [],
      subtotal: '0.00', discount_total: '0.00', tax_total: '0.00', total: '0.00', amount_paid: '0.00', amount_due: '0.00',
      confirmed_at: null, paid_at: null, cancelled_at: null, cancel_reason: 'internal', sent_at: 'x', created_at: 'x',
      can_edit: true, can_confirm: true, can_cancel: true, can_send: true,
    } as unknown as InvoiceDetailDto
    const out = toInvoiceDetail(inv, [{ id: '7', method: 'upi', payment_date: '2026-01-02', amount: '5.00', reference_number: 'R', is_voided: true, recorded_by: '1', void_reason: 'oops', note: 'n' } as never])
    const keys = keysDeep(out)
    for (const k of LEAKY_KEYS) expect(keys.has(k), k).toBe(false)
    expect(out.payments).toEqual([{ id: 7, method: 'upi', payment_date: '2026-01-02', amount: '5.00', reference_number: 'R', is_voided: true }])
  })
})

describe('portal query schemas never accept an identity', () => {
  it('rejects customer_id and unknown filters; hides drafts from filters', () => {
    expect(listMySubscriptionsQuery.safeParse({ customer_id: '2' }).success).toBe(false)
    expect(listMyInvoicesQuery.safeParse({ customer_id: '2' }).success).toBe(false)
    expect(listMySubscriptionsQuery.safeParse({ status: 'draft' }).success).toBe(false)
    expect(listMyInvoicesQuery.safeParse({ status: 'draft' }).success).toBe(false)
    expect(listMyInvoicesQuery.safeParse({ payment_state: 'draft' }).success).toBe(false)
    expect(listMyInvoicesQuery.parse({ payment_state: 'overdue,paid' }).payment_state).toEqual(['overdue', 'paid'])
    expect(listMyInvoicesQuery.safeParse({ page_size: '101' }).success).toBe(false)
  })
})
