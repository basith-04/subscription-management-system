import type { PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { transition, type TransitionOptions } from './state-machine.js'

function fixture(status: string | null = 'draft') {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return { rows: status === null ? [] : [{ status }], rowCount: status === null ? 0 : 1 }
    return { rows: [], rowCount: 1 }
  })
  const options: TransitionOptions = {
    tx: { query } as unknown as PoolClient, entity: 'subscriptions', id: 42,
    from: ['draft'], to: 'quotation', actorUserId: 3, action: 'subscription.issue',
    fields: { quotation_valid_until: '2026-11-01' },
  }
  return { query, options }
}

describe('transactional transition helper', () => {
  it('locks the row, uses a conditional update and writes the audit on the same client', async () => {
    const { query, options } = fixture()
    await transition(options)
    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    expect(query.mock.calls[1]?.[0]).toContain('AND status =')
    expect(query.mock.calls[1]?.[0]).toContain('quotation_valid_until =')
    expect(query.mock.calls[2]?.[0]).toContain('INSERT INTO audit_logs')
  })

  it('returns 404 for a missing row and 409 for a disallowed state', async () => {
    const missing = fixture(null)
    await expect(transition(missing.options)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    const wrong = fixture('confirmed')
    await expect(transition(wrong.options)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' })
    expect(wrong.query).toHaveBeenCalledTimes(1)
  })

  it('rejects unsupported columns before executing SQL', async () => {
    const { query, options } = fixture()
    options.fields = { 'status; DROP TABLE users': 'x' } as unknown as TransitionOptions['fields']
    await expect(transition(options)).rejects.toThrow('Unsupported transition field')
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 409 when a conditional update no longer matches', async () => {
    const { query, options } = fixture()
    query.mockImplementation(async (sql: string) => sql.startsWith('SELECT')
      ? { rows: [{ status: 'draft' }], rowCount: 1 }
      : { rows: [], rowCount: 0 })
    await expect(transition(options)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('propagates audit failures so the caller can roll back', async () => {
    const { query, options } = fixture()
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) return { rows: [{ status: 'draft' }], rowCount: 1 }
      if (sql.startsWith('INSERT')) throw new Error('audit unavailable')
      return { rows: [], rowCount: 1 }
    })
    await expect(transition(options)).rejects.toThrow('audit unavailable')
  })
})
