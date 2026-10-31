import type { Pool } from 'pg'
import type { ListAuditLogsQuery } from './audit-logs.schemas.js'

interface AuditLogRow {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string
  old_values: unknown | null
  new_values: unknown | null
  ip_address: string | null
  created_at: Date
  total_count: string
}

export interface AuditLogRecord {
  id: number
  actor: { id: number; name: string } | null
  action: string
  entity_type: string
  entity_id: number
  old_values: unknown | null
  new_values: unknown | null
  ip_address: string | null
  created_at: string
}

/** A single paged query avoids an N+1 actor lookup and a separate full-table count. */
export async function list(pool: Pool, filters: ListAuditLogsQuery): Promise<{ data: AuditLogRecord[]; total: number }> {
  const where: string[] = []
  const params: unknown[] = []
  const bind = (value: unknown) => { params.push(value); return `$${params.length}` }
  if (filters.entity_type) where.push(`a.entity_type = ${bind(filters.entity_type)}`)
  if (filters.entity_id) where.push(`a.entity_id = ${bind(filters.entity_id)}`)
  if (filters.actor_user_id) where.push(`a.actor_user_id = ${bind(filters.actor_user_id)}`)
  if (filters.action) where.push(`a.action = ${bind(filters.action)}`)
  if (filters.date_from) where.push(`a.created_at >= ${bind(filters.date_from)}`)
  if (filters.date_to) where.push(`a.created_at <= ${bind(filters.date_to)}`)
  const limit = bind(filters.page_size)
  const offset = bind((filters.page - 1) * filters.page_size)
  const result = await pool.query<AuditLogRow>(
    `SELECT a.id::text, a.actor_user_id::text, u.full_name AS actor_name,
            a.action, a.entity_type, a.entity_id::text, a.old_values, a.new_values,
            a.ip_address::text, a.created_at, count(*) OVER()::text AS total_count
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  return {
    total: Number(result.rows[0]?.total_count ?? 0),
    data: result.rows.map((row) => ({
      id: Number(row.id), actor: row.actor_user_id === null ? null : { id: Number(row.actor_user_id), name: row.actor_name ?? 'Deleted user' },
      action: row.action, entity_type: row.entity_type, entity_id: Number(row.entity_id), old_values: row.old_values,
      new_values: row.new_values, ip_address: row.ip_address, created_at: row.created_at.toISOString(),
    })),
  }
}
