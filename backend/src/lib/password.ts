import { Algorithm, hash, verify } from '@node-rs/argon2'
import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 9
export const PASSWORD_MAX_LENGTH = 128

const UPPERCASE = /[A-Z]/
const LOWERCASE = /[a-z]/
const SPECIAL = /[^A-Za-z0-9]/

/**
 * The single password policy shared by every feature (security-and-rbac.md §3).
 * More than 8 characters, at least one upper, one lower and one special.
 */
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    'Password must be more than 8 characters long',
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
  )
  .regex(UPPERCASE, 'Password must contain an uppercase letter')
  .regex(LOWERCASE, 'Password must contain a lowercase letter')
  .regex(SPECIAL, 'Password must contain a special character')

const HASH_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const

export async function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS)
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, {
      algorithm: Algorithm.Argon2id,
    })
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Constant-work verification for unknown accounts. It keeps the login path
 * from returning noticeably faster when an email is not registered.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-user-password')
  await verifyPassword(await dummyHash, password)
}
