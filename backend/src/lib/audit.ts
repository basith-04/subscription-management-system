import type { Queryable } from './db.js'

export interface AuditEntry {
  actorUserId: number | null
  action: string
  entityType: string
  entityId: number
  oldValues?: unknown
  newValues?: unknown
  ipAddress?: string | null
}

/**
 * Append an audit row using the caller's transaction/client. Callers must not
 * pass passwords, hashes, cookies, tokens or full request headers in values.
 */
export async function writeAudit(
  tx: Queryable,
  entry: AuditEntry,
): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorUserId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
      entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
      entry.ipAddress ?? null,
    ],
  )
}
