import { describe, expect, it } from 'vitest'
import { sanitizeAuditValues } from './audit.js'

describe('sanitizeAuditValues', () => {
  it('redacts secrets at every nesting depth without dropping business values', () => {
    expect(sanitizeAuditValues({ password_hash: 'hash', profile: { resetToken: 'raw', name: 'Ada' }, rows: [{ cookie: 'x', amount: 1 }] })).toEqual({ password_hash: '[REDACTED]', profile: { resetToken: '[REDACTED]', name: 'Ada' }, rows: [{ cookie: '[REDACTED]', amount: 1 }] })
  })
})
