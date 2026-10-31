import { describe, expect, it } from 'vitest'
import {
  createCustomerBody,
  listCustomersQuery,
  updateCustomerBody,
  updateOwnProfileBody,
} from '../../../src/modules/customers/customers.schemas.js'

const valid = { name: 'Asha Menon', email: 'Asha@Example.com' }

describe('createCustomerBody', () => {
  it('accepts a minimal customer and normalizes the email', () => {
    const parsed = createCustomerBody.parse(valid)
    expect(parsed.email).toBe('asha@example.com')
  })

  it('accepts all optional fields, converting empty strings to null', () => {
    const parsed = createCustomerBody.parse({
      ...valid, company_name: '', phone: '+91 98765 43210', tax_id: '29ABCDE1234F1Z5', notes: 'VIP',
      address: { line1: '12 MG Road', city: 'Kochi', postal_code: '682001', country: 'India', line2: '' },
    })
    expect(parsed.company_name).toBeNull()
    expect(parsed.address?.line2).toBeNull()
    expect(parsed.address?.city).toBe('Kochi')
  })

  it('requires name and a valid email', () => {
    expect(createCustomerBody.safeParse({ email: 'a@b.co' }).success).toBe(false)
    expect(createCustomerBody.safeParse({ name: '  ', email: 'a@b.co' }).success).toBe(false)
    expect(createCustomerBody.safeParse({ name: 'A', email: 'not-an-email' }).success).toBe(false)
  })

  it('enforces length limits (very long names and addresses)', () => {
    expect(createCustomerBody.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false)
    expect(createCustomerBody.safeParse({ ...valid, name: 'x'.repeat(120) }).success).toBe(true)
    expect(createCustomerBody.safeParse({ ...valid, address: { line1: 'x'.repeat(201) } }).success).toBe(false)
    expect(createCustomerBody.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('supports Unicode in names and addresses and rejects control characters', () => {
    const ok = createCustomerBody.safeParse({ name: 'അനു 山田 Zoë 😀', email: 'u@e.co', address: { line1: 'Straße 5, München' } })
    expect(ok.success).toBe(true)
    expect(createCustomerBody.safeParse({ ...valid, name: 'bad\u0000name' }).success).toBe(false)
  })

  it('rejects malformed phone numbers and unknown / privileged fields', () => {
    expect(createCustomerBody.safeParse({ ...valid, phone: 'call me' }).success).toBe(false)
    expect(createCustomerBody.safeParse({ ...valid, is_active: false }).success).toBe(false)
    expect(createCustomerBody.safeParse({ ...valid, user_id: 5 }).success).toBe(false)
    expect(createCustomerBody.safeParse({ ...valid, address: { street: 'x' } }).success).toBe(false)
  })
})

describe('updateCustomerBody', () => {
  it('accepts a subset including is_active, rejects empty bodies', () => {
    expect(updateCustomerBody.safeParse({ is_active: false }).success).toBe(true)
    expect(updateCustomerBody.safeParse({ phone: null }).success).toBe(true)
    expect(updateCustomerBody.safeParse({}).success).toBe(false)
  })
})

describe('updateOwnProfileBody (mass-assignment protection)', () => {
  it('accepts name, company_name, phone and address', () => {
    const parsed = updateOwnProfileBody.parse({ name: 'New', company_name: 'Co', phone: '+1 555 123 4567', address: { city: 'Kochi' } })
    expect(parsed.address?.city).toBe('Kochi')
  })

  it.each(['email', 'is_active', 'notes', 'tax_id', 'user_id', 'id'])('rejects forbidden field %s', (field) => {
    const result = updateOwnProfileBody.safeParse({ name: 'X', [field]: field === 'is_active' ? true : 'v' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty update', () => {
    expect(updateOwnProfileBody.safeParse({}).success).toBe(false)
  })
})

describe('listCustomersQuery', () => {
  it('parses documented params and rejects unknown ones', () => {
    expect(listCustomersQuery.parse({ q: 'asha', is_active: 'false', sort: '-name', page: '2' }).is_active).toBe(false)
    expect(listCustomersQuery.safeParse({ role: 'x' }).success).toBe(false)
    expect(listCustomersQuery.safeParse({ sort: 'email' }).success).toBe(false)
  })
})
