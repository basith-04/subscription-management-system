import type { Queryable } from './db.js'
import type { Transaction } from '../db/client.js'

export interface AuditEntry {
  actorUserId: number | null
  action: string
  entityType: string
  entityId: number | string
  oldValues?: unknown
  newValues?: unknown
  ipAddress?: string | null
}

export interface AuditLogPayload {
  actor: {
    id: string | number
    email?: string
    role?: string
  }
  action: string
  entityType: string
  entityId: string
  old?: Record<string, unknown> | null
  new?: Record<string, unknown> | null
}

const SENSITIVE_KEY = /(password|passphrase|secret|token|cookie|authorization|credential|session)/i

/**
 * Removes credentials recursively before an audit value reaches persistence or
 * a read API.  Keeping this here makes every producer and consumer follow the
 * same contract; audit entries are business history, never a secret store.
 */
export function sanitizeAuditValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValues)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeAuditValues(nested)]))
  }
  return value
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
      entry.oldValues === undefined ? null : JSON.stringify(sanitizeAuditValues(entry.oldValues)),
      entry.newValues === undefined ? null : JSON.stringify(sanitizeAuditValues(entry.newValues)),
      entry.ipAddress ?? null,
    ],
  )
}

export const audit = {
  async log(tx: Transaction, payload: AuditLogPayload) {
    return tx.createAuditLog({
      actor_id: String(payload.actor.id),
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      old_state: payload.old === null || payload.old === undefined ? null : sanitizeAuditValues(payload.old) as Record<string, unknown>,
      new_state: payload.new === null || payload.new === undefined ? null : sanitizeAuditValues(payload.new) as Record<string, unknown>,
    })
  },
}
