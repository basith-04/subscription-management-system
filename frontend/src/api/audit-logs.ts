import { apiRequest } from '../lib/api'
import type { AuditLogFilters, AuditLogList } from '../features/audit-logs/types'

export function listAuditLogs(filters: AuditLogFilters): Promise<AuditLogList> {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)) })
  return apiRequest<AuditLogList>(`/audit-logs?${query.toString()}`, { raw: true })
}
