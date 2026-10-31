import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { signSessionToken, verifySessionToken } from './session.js'

const secret = 'test-secret-that-is-at-least-32-characters-long'
const config = loadConfig({ JWT_SECRET: secret } as NodeJS.ProcessEnv)

describe('session verification', () => {
  it('accepts issued tokens and rejects tokens signed with the wrong key', async () => {
    const token = await signSessionToken({ user_id: 12, role: 'customer' }, config)
    expect(await verifySessionToken(token, config)).toEqual({ user_id: 12, role: 'customer' })
    const wrongConfig = loadConfig({ JWT_SECRET: `${secret}-different` } as NodeJS.ProcessEnv)
    expect(await verifySessionToken(token, wrongConfig)).toBeNull()
  })

  it('rejects correctly signed tokens without expiry', async () => {
    const token = await new SignJWT({ role: 'customer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('12')
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret))
    expect(await verifySessionToken(token, config)).toBeNull()
  })

  it('rejects unsigned tokens and algorithms other than HS256', async () => {
    const token = await new SignJWT({ role: 'customer' })
      .setProtectedHeader({ alg: 'HS384' })
      .setSubject('12')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret))
    expect(await verifySessionToken(token, config)).toBeNull()
    expect(await verifySessionToken('eyJhbGciOiJub25lIn0.e30.', config)).toBeNull()
  })
})
