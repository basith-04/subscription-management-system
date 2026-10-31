import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { scopeToCustomer } from './permissions.js'

describe('customer scope', () => {
  it('takes the customer id from the authenticated user, not request data', () => {
    const req = { user: { id: 1, email: 'a@example.test', full_name: 'A', role: 'customer', customer_id: 12 }, body: { customer_id: 99 } } as Request
    expect(scopeToCustomer(req)).toBe(12)
  })

  it('rejects anonymous users, staff and customers without profiles', () => {
    expect(() => scopeToCustomer({} as Request)).toThrowError(expect.objectContaining({ status: 401 }))
    expect(() => scopeToCustomer({ user: { role: 'staff', customer_id: 12 } } as Request)).toThrowError(expect.objectContaining({ status: 403 }))
    expect(() => scopeToCustomer({ user: { role: 'customer', customer_id: null } } as Request)).toThrowError(expect.objectContaining({ status: 403 }))
  })
})
