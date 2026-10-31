import type { Pool } from 'pg'
import type { PaymentTermRecord } from '../../db/client.js'
import { getSharedPool, isPgError, withTransaction } from '../../lib/db.js'
import { writeAudit } from '../../lib/audit.js'
import { ApiError } from '../../middleware/error-handler.js'
import { paymentTermsRepository } from './payment-terms.repository.js'
import type { CreatePaymentTermInput, UpdatePaymentTermInput } from './payment-terms.schemas.js'
import type { AuthenticatedUser } from '../../middleware/authenticate.js'

function mapError(error: unknown): never {
  if (isPgError(error) && error.code === '23505') throw new ApiError(409, 'DUPLICATE_NAME', 'A payment term with this name already exists')
  throw error
}
export const paymentTermsService = {
  async listPaymentTerms(filter?: { isActive?: boolean }, pool: Pool = getSharedPool()) { return paymentTermsRepository.list(pool, filter) },
  async getPaymentTermById(id: string, pool: Pool = getSharedPool()) {
    const term = await paymentTermsRepository.findById(pool, id)
    if (!term) throw new ApiError(404, 'NOT_FOUND', `Payment term with id ${id} not found`)
    return term
  },
  async createPaymentTerm(input: CreatePaymentTermInput, actor: AuthenticatedUser, pool: Pool = getSharedPool()): Promise<PaymentTermRecord> {
    try {
      return await withTransaction(pool, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 502))", [input.name])
        if (await paymentTermsRepository.findByName(tx, input.name)) throw new ApiError(409, 'DUPLICATE_NAME', 'A payment term with this name already exists')
        const created = await paymentTermsRepository.create(tx, input)
        await writeAudit(tx, { actorUserId: actor.id, action: 'payment_term.create', entityType: 'payment_term', entityId: created.id, newValues: created })
        return created
      })
    } catch (error) { return mapError(error) }
  },
  async updatePaymentTerm(id: string, input: UpdatePaymentTermInput, actor: AuthenticatedUser, pool: Pool = getSharedPool()): Promise<PaymentTermRecord> {
    try {
      return await withTransaction(pool, async (tx) => {
        if (input.name) await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 502))", [input.name])
        const current = await paymentTermsRepository.findById(tx, id, true)
        if (!current) throw new ApiError(404, 'NOT_FOUND', `Payment term with id ${id} not found`)
        if (input.name) {
          const other = await paymentTermsRepository.findByName(tx, input.name)
          if (other && other.id !== id) throw new ApiError(409, 'DUPLICATE_NAME', 'A payment term with this name already exists')
        }
        const updated = (await paymentTermsRepository.update(tx, id, input))!
        await writeAudit(tx, { actorUserId: actor.id, action: input.is_active === false && current.is_active ? 'payment_term.deactivate' : 'payment_term.update', entityType: 'payment_term', entityId: id, oldValues: current, newValues: updated })
        return updated
      })
    } catch (error) { return mapError(error) }
  },
}
