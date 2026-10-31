import { describe, expect, it } from 'vitest'
import { getF09Transition, type F09SubscriptionAction, type SubscriptionStatus } from './subscriptions.state-machine.js'

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
