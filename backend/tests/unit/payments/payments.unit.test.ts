import { describe, expect, it } from 'vitest'
import { remainingAfter, sumMoney, validateAllocations, type BalanceInvoice } from '../../../src/modules/payments/payments.calc.js'
import { recordPaymentBody, voidPaymentBody, listPaymentsQuery } from '../../../src/modules/payments/payments.schemas.js'
import { derivePaymentState } from '../../../src/modules/invoices/invoices.payment-state.js'
import { statusAfterBalanceChange, canTransition } from '../../../src/modules/invoices/invoices.state-machine.js'

const inv = (id: number, over: Partial<BalanceInvoice> = {}): BalanceInvoice => ({ id, number: `INV-${id}`, customer_id: 1, status: 'confirmed', amount_due: '100.00', ...over })
const map = (...rows: BalanceInvoice[]) => new Map(rows.map((r) => [r.id, r]))
const body = (over: Record<string, unknown> = {}) => ({ method: 'cash', amount: '100.00', payment_date: '2026-11-01', allocations: [{ invoice_id: 1, amount: '100.00' }], ...over })

describe('decimal-safe money', () => {
  it('0.10 + 0.20 = 0.30 and sums stay exact', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumMoney(Array(10).fill('0.10'))).toBe('1.00')
    expect(sumMoney(['99999999.99', '0.01'])).toBe('100000000.00')
    expect(remainingAfter('0.30', [{ invoice_id: 1, amount: '0.10' }, { invoice_id: 2, amount: '0.20' }])).toBe('0.00')
  })
})

describe('validateAllocations', () => {
  it('accepts exact, partial and multi-invoice allocations', () => {
    expect(validateAllocations('100.00', [{ invoice_id: 1, amount: '100.00' }], map(inv(1)))).toEqual([])
    expect(validateAllocations('100.00', [{ invoice_id: 1, amount: '40.00' }], map(inv(1)))).toEqual([])
    expect(validateAllocations('150.00', [{ invoice_id: 1, amount: '100.00' }, { invoice_id: 2, amount: '50.00' }], map(inv(1), inv(2)))).toEqual([])
  })
  it('rejects an allocation above the amount due', () => {
    const [i] = validateAllocations('200.00', [{ invoice_id: 1, amount: '100.01' }], map(inv(1)))
    expect(i?.code).toBe('ALLOCATION_EXCEEDS_AMOUNT_DUE')
  })
  it('rejects total allocations above the payment amount', () => {
    const issues = validateAllocations('100.00', [{ invoice_id: 1, amount: '60.00' }, { invoice_id: 2, amount: '60.00' }], map(inv(1), inv(2)))
    expect(issues.map((x) => x.code)).toEqual(['ALLOCATIONS_EXCEED_PAYMENT'])
  })
  it.each(['draft', 'cancelled', 'paid'])('rejects %s invoices', (status) => {
    expect(validateAllocations('10.00', [{ invoice_id: 1, amount: '10.00' }], map(inv(1, { status })))[0]?.code).toBe('INVOICE_NOT_CONFIRMED')
  })
  it('rejects mixed customers, duplicate and unknown invoices', () => {
    expect(validateAllocations('20.00', [{ invoice_id: 1, amount: '10.00' }, { invoice_id: 2, amount: '10.00' }], map(inv(1), inv(2, { customer_id: 2 }))).map((x) => x.code)).toContain('MIXED_CUSTOMERS')
    expect(validateAllocations('20.00', [{ invoice_id: 1, amount: '10.00' }, { invoice_id: 1, amount: '10.00' }], map(inv(1))).map((x) => x.code)).toContain('DUPLICATE_INVOICE')
    expect(validateAllocations('10.00', [{ invoice_id: 9, amount: '10.00' }], map(inv(1)))[0]?.code).toBe('UNKNOWN_INVOICE')
  })
})

describe('state decisions after a payment / void', () => {
  it('partial payment keeps confirmed; full payment → paid; void → confirmed', () => {
    expect(statusAfterBalanceChange('confirmed', '100.00', '40.00')).toBe('confirmed')
    expect(statusAfterBalanceChange('confirmed', '100.00', '100.00')).toBe('paid')
    expect(statusAfterBalanceChange('paid', '100.00', '60.00')).toBe('confirmed')
    expect(statusAfterBalanceChange('paid', '100.00', '100.00')).toBe('paid')
    expect(statusAfterBalanceChange('draft', '100.00', '0.00')).toBe('draft')
    expect(statusAfterBalanceChange('cancelled', '100.00', '0.00')).toBe('cancelled')
  })
  it('only the payment service may take confirmed↔paid', () => {
    expect(canTransition('confirmed', 'paid', 'payments')).toBe(true)
    expect(canTransition('paid', 'confirmed', 'payments')).toBe(true)
    expect(canTransition('confirmed', 'paid', 'invoices')).toBe(false)
  })
})

describe('outstanding / overdue after payments (shared payment_state)', () => {
  const today = '2026-11-10'
  it('partial payment stays outstanding, or overdue once past due; full payment is paid', () => {
    expect(derivePaymentState({ status: 'confirmed', amount_paid: '40.00', amount_due: '60.00', due_date: '2026-11-20' }, today)).toBe('partially_paid')
    expect(derivePaymentState({ status: 'confirmed', amount_paid: '40.00', amount_due: '60.00', due_date: '2026-11-01' }, today)).toBe('overdue')
    expect(derivePaymentState({ status: 'paid', amount_paid: '100.00', amount_due: '0.00', due_date: '2026-11-01' }, today)).toBe('paid')
  })
  it('a voided payment (amount_paid back to 0) restores the unpaid state', () => {
    expect(derivePaymentState({ status: 'confirmed', amount_paid: '0.00', amount_due: '100.00', due_date: '2026-11-01' }, today)).toBe('overdue')
  })
})

describe('payment request schemas', () => {
  it('accepts a valid body and normalises blanks to null', () => {
    const p = recordPaymentBody.parse(body({ note: '', reference_number: '  ' }))
    expect(p.note).toBeNull(); expect(p.reference_number).toBeNull()
  })
  it.each([
    ['unknown method', { method: 'crypto' }], ['zero amount', { amount: '0.00' }], ['3 decimals', { amount: '1.001' }],
    ['numeric amount', { amount: 10 }], ['negative', { amount: '-5.00' }], ['bad date', { payment_date: '2026-02-30' }],
    ['no allocations', { allocations: [] }], ['zero allocation', { allocations: [{ invoice_id: 1, amount: '0.00' }] }],
    ['extra field', { voided_at: 'x' }], ['long reference', { reference_number: 'x'.repeat(101) }],
  ])('rejects %s', (_n, over) => expect(recordPaymentBody.safeParse(body(over)).success).toBe(false))
  it('void needs a reason; list rejects unknown filters', () => {
    expect(voidPaymentBody.safeParse({ reason: 'typo' }).success).toBe(true)
    expect(voidPaymentBody.safeParse({ reason: '  ' }).success).toBe(false)
    expect(listPaymentsQuery.safeParse({ foo: 1 }).success).toBe(false)
    expect(listPaymentsQuery.parse({ voided: 'false' }).voided).toBe(false)
  })
})
