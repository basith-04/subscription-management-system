import type { Pool } from 'pg'
import { sanitizeAuditValues } from '../../lib/audit.js'
import { buildMeta } from '../../lib/pagination.js'
import * as repository from './audit-logs.repository.js'
import type { ListAuditLogsQuery } from './audit-logs.schemas.js'

export async function list(pool: Pool, filters: ListAuditLogsQuery) {
  const result = await repository.list(pool, filters)
  return {
    data: result.data.map((entry) => ({
      ...entry,
      // Redacts any unsafe legacy row using the same shared F00 policy. It does
      // not mutate immutable audit history.
      old_values: entry.old_values === null ? null : sanitizeAuditValues(entry.old_values),
      new_values: entry.new_values === null ? null : sanitizeAuditValues(entry.new_values),
    })),
    meta: buildMeta(result.total, filters.page, filters.page_size),
  }
}
