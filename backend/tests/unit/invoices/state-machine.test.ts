import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../src/lib/errors.js'
import { INVOICE_STATUSES, type InvoiceStatus } from '../../../src/modules/invoices/invoices.constants.js'
import { assertTransition, canTransition } from '../../../src/modules/invoices/invoices.state-machine.js'

const ALLOWED_BY_INVOICES: Array<[InvoiceStatus, InvoiceStatus]> = [
  ['draft', 'confirmed'], ['draft', 'cancelled'], ['confirmed', 'cancelled'],
]
const ALLOWED_BY_PAYMENTS: Array<[InvoiceStatus, InvoiceStatus]> = [['confirmed', 'paid'], ['paid', 'confirmed']]

describe('invoice state machine', () => {
  it.each(ALLOWED_BY_INVOICES)('allows %s → %s for invoice management', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
    expect(() => assertTransition(from, to)).not.toThrow()
  })

  it.each(ALLOWED_BY_PAYMENTS)('%s → %s is reserved for the payment service (F13)', (from, to) => {
    expect(canTransition(from, to, 'payments')).toBe(true)
    expect(canTransition(from, to, 'invoices')).toBe(false)
    expect(() => assertTransition(from, to)).toThrow(ApiError)
  })

  it('rejects every pair that is not in the table, with 409 INVALID_STATE_TRANSITION', () => {
    const allowed = new Set([...ALLOWED_BY_INVOICES, ...ALLOWED_BY_PAYMENTS].map(([a, b]) => `${a}>${b}`))
    for (const from of INVOICE_STATUSES) for (const to of INVOICE_STATUSES) {
      if (allowed.has(`${from}>${to}`)) continue
      for (const actor of ['invoices', 'payments'] as const) expect(canTransition(from, to, actor)).toBe(false)
      try {
        assertTransition(from, to)
        throw new Error(`expected ${from} → ${to} to be rejected`)
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
        expect((e as ApiError).status).toBe(409)
        expect((e as ApiError).code).toBe('INVALID_STATE_TRANSITION')
      }
    }
  })

  it.each<[InvoiceStatus, InvoiceStatus]>([
    ['paid', 'draft'], ['paid', 'cancelled'], ['cancelled', 'draft'], ['cancelled', 'confirmed'],
    ['cancelled', 'paid'], ['confirmed', 'draft'],
  ])('documented rejection: %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
    expect(canTransition(from, to, 'payments')).toBe(false)
  })
})
