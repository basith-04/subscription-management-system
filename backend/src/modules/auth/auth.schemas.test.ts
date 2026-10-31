import { describe, expect, it } from 'vitest'
import {
  loginSchema,
  registerSchema,
} from './auth.schemas.js'

const validRegistration = {
  full_name: '  Example Customer  ',
  email: '  Customer@Example.com ',
  password: 'Example!Pass123',
  company_name: '  Example Company ',
  phone: '+91 9876543210',
}

describe('registerSchema', () => {
  it('trims and lowercases the email and trims the name', () => {
    const parsed = registerSchema.parse(validRegistration)

    expect(parsed.email).toBe('customer@example.com')
    expect(parsed.full_name).toBe('Example Customer')
    expect(parsed.company_name).toBe('Example Company')
  })

  it('treats empty optional fields as absent', () => {
    const parsed = registerSchema.parse({
      ...validRegistration,
      company_name: '',
      phone: '   ',
    })

    expect(parsed.company_name).toBeUndefined()
    expect(parsed.phone).toBeUndefined()
  })

  it('rejects exactly 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: 'Abcde!1x',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a password equal to the email', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      email: 'same@example.com',
      password: 'Same@example.com',
    })

    expect(result.success).toBe(false)
  })

  it.each(['role', 'role_id', 'customer_id', 'is_active', 'password_hash'])(
    'rejects the privileged field %s',
    (field) => {
      const result = registerSchema.safeParse({
        ...validRegistration,
        [field]: 'admin',
      })

      expect(result.success).toBe(false)
    },
  )
})

describe('loginSchema', () => {
  it('normalizes the email and accepts a non-empty password', () => {
    const parsed = loginSchema.parse({
      email: '  USER@Example.com ',
      password: 'anything',
    })

    expect(parsed.email).toBe('user@example.com')
  })

  it('rejects unknown fields', () => {
    expect(
      loginSchema.safeParse({
        email: 'user@example.com',
        password: 'anything',
        role: 'admin',
      }).success,
    ).toBe(false)
  })
})
