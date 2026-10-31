import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  passwordSchema,
  verifyDummyPassword,
  verifyPassword,
} from './password.js'

describe('password policy', () => {
  it('accepts a password with more than 8 characters and every character class', () => {
    expect(passwordSchema.safeParse('Example!Pass123').success).toBe(true)
  })

  it('rejects a password of exactly 8 characters', () => {
    const result = passwordSchema.safeParse('Abcde!1x')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/more than 8/i)
    }
  })

  it.each([
    ['missing uppercase', 'example!pass123'],
    ['missing lowercase', 'EXAMPLE!PASS123'],
    ['missing special character', 'ExamplePass123'],
  ])('rejects a password %s', (_label, password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false)
  })

  it('rejects a password longer than 128 characters', () => {
    expect(passwordSchema.safeParse(`Aa!${'a'.repeat(126)}`).success).toBe(
      false,
    )
  })
})

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const passwordHash = await hashPassword('Example!Pass123')

    expect(passwordHash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(passwordHash, 'Example!Pass123')).toBe(true)
    expect(await verifyPassword(passwordHash, 'Wrong!Pass123')).toBe(false)
  })

  it('performs a dummy verification without throwing', async () => {
    await expect(verifyDummyPassword('Anything!123')).resolves.toBeUndefined()
  })
})
