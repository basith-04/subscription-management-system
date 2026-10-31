import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('production cookie configuration', () => {
  const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

  it('defaults to secure cookies in production', () => {
    expect(loadConfig({ APP_ENV: 'production', JWT_SECRET } as NodeJS.ProcessEnv).cookie.secure).toBe(true)
  })

  it('rejects explicitly insecure cookies in production', () => {
    expect(() => loadConfig({ APP_ENV: 'production', JWT_SECRET, COOKIE_SECURE: 'false' } as NodeJS.ProcessEnv)).toThrow(/COOKIE_SECURE/)
  })
})
