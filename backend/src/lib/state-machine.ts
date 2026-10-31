import type { PoolClient } from 'pg'
import { writeAudit } from './audit.js'
import { ERROR_CODES } from './error-codes.js'
import { ApiError } from './errors.js'

/** Only fixed, documented subscription columns may accompany an F09 transition. */
export interface SubscriptionTransitionFields {
  quotation_valid_until?: string | null
  confirmed_at?: Date | null
  closed_at?: Date | null
  closed_reason?: string | null
}

export interface TransitionOptions {
  /** Must be a client inside the service's existing transaction. */
  tx: PoolClient
  entity: 'subscriptions'
  id: number
  from: readonly string[]
  to: string
  fields?: SubscriptionTransitionFields
  actorUserId: number | null
  action: string
  /** Optional user-facing reason to preserve in transition history. */
  reason?: string
  ipAddress?: string | null
}

const allowedFields = new Set([
  'quotation_valid_until', 'confirmed_at', 'closed_at', 'closed_reason',
])

/**
 * Lock and conditionally update one subscription, then audit on the same client.
 * The caller owns BEGIN/COMMIT/ROLLBACK and must check ownership and domain
 * rules before calling. SQL identifiers are fixed or checked against a whitelist.
 * Later F10/F11 work may extend supported entities and fields deliberately.
 */
export async function transition(options: TransitionOptions): Promise<void> {
  const { tx, entity, id, from, to, fields = {}, actorUserId, action, reason, ipAddress } = options
  if (entity !== 'subscriptions' || !Number.isSafeInteger(id) || id < 1 || from.length === 0 || !action.trim()) {
    throw new RangeError('Invalid transition parameters')
  }
  const suppliedFields = Object.entries(fields)
  if (suppliedFields.some(([field]) => !allowedFields.has(field))) {
    throw new RangeError('Unsupported transition field')
  }
  const entries = suppliedFields.filter(([, value]) => value !== undefined)

  const existing = await tx.query<{ status: string }>(
    'SELECT status FROM subscriptions WHERE id = $1 FOR UPDATE',
    [id],
  )
  const previous = existing.rows[0]?.status
  if (previous === undefined) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Subscription not found')
  if (!from.includes(previous)) {
    throw new ApiError(409, ERROR_CODES.INVALID_STATE_TRANSITION, 'Subscription state does not permit this action')
  }

  const params: unknown[] = [to]
  const assignments = ['status = $1', 'updated_at = now()']
  for (const [field, value] of entries) {
    params.push(value)
    assignments.push(`${field} = $${params.length}`)
  }
  params.push(id, previous)
  const result = await tx.query(
    `UPDATE subscriptions SET ${assignments.join(', ')} WHERE id = $${params.length - 1} AND status = $${params.length}`,
    params,
  )
  if (result.rowCount !== 1) {
    throw new ApiError(409, ERROR_CODES.INVALID_STATE_TRANSITION, 'Subscription state does not permit this action')
  }

  await writeAudit(tx, {
    actorUserId, action, entityType: 'subscription', entityId: id,
    oldValues: { status: previous }, newValues: { status: to, ...(reason !== undefined ? { reason } : {}) },
    ipAddress: ipAddress ?? null,
  })
}
