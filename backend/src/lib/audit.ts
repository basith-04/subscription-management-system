import type { Transaction } from '../db/client.js'

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

export const audit = {
  async log(tx: Transaction, payload: AuditLogPayload) {
    return tx.createAuditLog({
      actor_id: String(payload.actor.id),
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      old_state: payload.old ?? null,
      new_state: payload.new ?? null,
    })
  },
}
