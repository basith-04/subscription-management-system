import { describe, expect, it } from 'vitest'
import { derivePaymentState, paymentStateSql, todayInBusinessTimezone } from '../../../src/modules/invoices/invoices.payment-state.js'
import type { InvoiceStatus, PaymentState } from '../../../src/modules/invoices/invoices.constants.js'

const inv = (status: InvoiceStatus, paid: string, due: string, dueDate = '2026-11-16') => ({
  status, amount_paid: paid, amount_due: due, due_date: dueDate,
})

describe('derivePaymentState', () => {
  const TODAY = '2026-11-10'

  it.each<[string, ReturnType<typeof inv>, string, PaymentState]>([
    ['draft stays draft (even past due)', inv('draft', '0.00', '100.00', '2026-01-01'), TODAY, 'draft'],
    ['cancelled stays cancelled (even past due)', inv('cancelled', '0.00', '100.00', '2026-01-01'), TODAY, 'cancelled'],
    ['paid status is paid', inv('paid', '100.00', '0.00', '2026-01-01'), TODAY, 'paid'],
    ['confirmed with nothing left to pay is paid', inv('confirmed', '100.00', '0.00'), TODAY, 'paid'],
    ['future due date, nothing paid → not_due', inv('confirmed', '0.00', '100.00', '2026-11-16'), TODAY, 'not_due'],
    ['due today, nothing paid → outstanding', inv('confirmed', '0.00', '100.00', TODAY), TODAY, 'outstanding'],
    ['yesterday due, nothing paid → overdue (grace 0)', inv('confirmed', '0.00', '100.00', '2026-11-09'), TODAY, 'overdue'],
    ['part paid, not yet due → partially_paid', inv('confirmed', '40.00', '60.00', '2026-11-16'), TODAY, 'partially_paid'],
    ['part paid, due today → partially_paid', inv('confirmed', '40.00', '60.00', TODAY), TODAY, 'partially_paid'],
    ['part paid and past due → overdue (never paid)', inv('confirmed', '40.00', '60.00', '2026-11-09'), TODAY, 'overdue'],
  ])('%s', (_name, invoice, today, expected) => {
    expect(derivePaymentState(invoice, today)).toBe(expected)
  })

  it('overdue is never reported as paid or cancelled', () => {
    const state = derivePaymentState(inv('confirmed', '0.01', '99.99', '2020-01-01'), TODAY)
    expect(state).toBe('overdue')
    expect(['paid', 'cancelled']).not.toContain(state)
  })

  describe('grace days boundary (D-13)', () => {
    const invoice = inv('confirmed', '0.00', '100.00', '2026-11-10')
    it('grace 0: the day after the due date is overdue', () => {
      expect(derivePaymentState(invoice, '2026-11-10', 0)).toBe('outstanding')
      expect(derivePaymentState(invoice, '2026-11-11', 0)).toBe('overdue')
    })
    it('grace 3: overdue only after due_date + 3', () => {
      expect(derivePaymentState(invoice, '2026-11-11', 3)).toBe('outstanding')
      expect(derivePaymentState(invoice, '2026-11-13', 3)).toBe('outstanding')
      expect(derivePaymentState(invoice, '2026-11-14', 3)).toBe('overdue')
    })
    it('grace crosses month and year ends', () => {
      const dec = inv('confirmed', '0.00', '10.00', '2026-12-30')
      expect(derivePaymentState(dec, '2027-01-02', 3)).toBe('outstanding')
      expect(derivePaymentState(dec, '2027-01-03', 3)).toBe('overdue')
    })
  })

  it('has one distinct result for every status × paid/due combination (no undefined states)', () => {
    const statuses: InvoiceStatus[] = ['draft', 'confirmed', 'paid', 'cancelled']
    const amounts: Array<[string, string]> = [['0.00', '100.00'], ['40.00', '60.00'], ['100.00', '0.00']]
    const dates = ['2026-11-01', '2026-11-10', '2026-11-20']
    const valid = new Set(['draft', 'not_due', 'outstanding', 'partially_paid', 'overdue', 'paid', 'cancelled'])
    for (const s of statuses) for (const [p, d] of amounts) for (const due of dates) {
      expect(valid.has(derivePaymentState(inv(s, p, d, due), '2026-11-10'))).toBe(true)
    }
  })
})

describe('paymentStateSql', () => {
  it('uses bound placeholders only and mirrors every JS branch', () => {
    const sql = paymentStateSql('i', '$1', '$2')
    for (const word of ['draft', 'cancelled', 'paid', 'overdue', 'partially_paid', 'not_due', 'outstanding']) {
      expect(sql).toContain(`'${word}'`)
    }
    expect(sql).toContain('$1::date')
    expect(sql).toContain('$2::int')
  })
})

describe('todayInBusinessTimezone (D-22)', () => {
  it('uses the business timezone calendar date, not UTC', () => {
    const instant = new Date('2026-11-10T20:00:00Z') // 01:30 on the 11th in Asia/Kolkata
    expect(todayInBusinessTimezone(instant, 'Asia/Kolkata')).toBe('2026-11-11')
    expect(todayInBusinessTimezone(instant, 'UTC')).toBe('2026-11-10')
    expect(todayInBusinessTimezone(instant, 'America/Los_Angeles')).toBe('2026-11-10')
  })
})
