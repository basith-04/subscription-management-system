import { describe, expect, it } from 'vitest'
import { listAuditLogsQuery } from './audit-logs.schemas.js'

describe('listAuditLogsQuery', () => {
  it('defaults bounded pagination', () => {
    expect(listAuditLogsQuery.parse({})).toMatchObject({ page: 1, page_size: 20 })
  })
  it('rejects oversized pages and inverted date ranges', () => {
    expect(() => listAuditLogsQuery.parse({ page_size: '101' })).toThrow()
    expect(() => listAuditLogsQuery.parse({ date_from: '2026-01-02T00:00:00.000Z', date_to: '2026-01-01T00:00:00.000Z' })).toThrow()
  })
  it('parses filter combinations and ISO dates', () => {
    const value = listAuditLogsQuery.parse({ entity_type: 'payment', entity_id: '8', actor_user_id: '2', action: 'payment.record', date_from: '2026-01-01T00:00:00.000Z' })
    expect(value.entity_id).toBe(8); expect(value.date_from).toBeInstanceOf(Date)
  })
})
