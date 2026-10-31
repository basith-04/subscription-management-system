import { describe, expect, it } from 'vitest'
import { assertQuotationValidity, getF09Transition, type F09SubscriptionAction, type SubscriptionStatus } from './subscriptions.state-machine.js'

const states: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'closed']
const actions: F09SubscriptionAction[] = ['issue', 'confirm', 'cancel']
const expected: Partial<Record<F09SubscriptionAction, Partial<Record<SubscriptionStatus, SubscriptionStatus>>>> = {
  issue: { draft: 'quotation' },
  confirm: { quotation: 'confirmed' },
  cancel: { draft: 'closed', quotation: 'closed', confirmed: 'closed' },
}

describe('F09 quotation transition rules', () => {
  for (const action of actions) {
    for (const state of states) {
      it(`${action} from ${state} follows the documented transition table`, () => {
        const target = expected[action]?.[state]
        if (target) {
          expect(getF09Transition(action, state)).toBe(target)
        } else {
          expect(() => getF09Transition(action, state)).toThrowError(
            expect.objectContaining({ status: 409, code: 'INVALID_STATE_TRANSITION' }),
          )
        }
      })
    }
  }

  it('fails closed for an unknown stored status', () => {
    expect(() => getF09Transition('cancel', 'unrecognized')).toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_STATE_TRANSITION' }),
    )
  })
})

describe('quotation validity', () => {
  it('allows confirmation on and before the inclusive expiry date', () => {
    expect(() => assertQuotationValidity('2028-02-29', '2028-02-29')).not.toThrow()
    expect(() => assertQuotationValidity('2028-02-29', '2028-02-28')).not.toThrow()
  })

  it('rejects expired, missing and malformed validity dates', () => {
    for (const validUntil of ['2028-02-29', null, '2027-02-29', 'not-a-date']) {
      expect(() => assertQuotationValidity(validUntil, '2028-03-01')).toThrowError(
        expect.objectContaining({ status: 409, code: 'QUOTATION_EXPIRED' }),
      )
    }
  })

  it('fails closed when the injected business date is malformed', () => {
    expect(() => assertQuotationValidity('2028-02-29', '2028-02-30')).toThrow(RangeError)
  })
})
