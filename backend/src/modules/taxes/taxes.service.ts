import type { Pool } from 'pg'
import type { TaxRuleRecord } from '../../db/client.js'
import { getSharedPool, isPgError, withTransaction } from '../../lib/db.js'
import { writeAudit } from '../../lib/audit.js'
import { ApiError } from '../../middleware/error-handler.js'
import { taxesRepository } from './taxes.repository.js'
import type { CreateTaxInput, UpdateTaxInput } from './taxes.schemas.js'
import type { AuthenticatedUser } from '../../middleware/authenticate.js'

function mapError(error: unknown): never {
  if (isPgError(error) && error.code === '23505') throw new ApiError(409, 'DUPLICATE_NAME', 'A tax rule with this name already exists')
  if (isPgError(error) && error.code === '23503') throw new ApiError(409, 'IN_USE', 'Deactivate it instead')
  throw error
}
export const taxesService = {
  async listTaxes(filter?: { isActive?: boolean }, pool: Pool = getSharedPool()) { return taxesRepository.list(pool, filter) },
  async getTaxById(id: string, pool: Pool = getSharedPool()) {
    const tax = await taxesRepository.findById(pool, id)
    if (!tax) throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
    return tax
  },
  async createTax(input: CreateTaxInput, actor: AuthenticatedUser, pool: Pool = getSharedPool()): Promise<TaxRuleRecord> {
    try {
      return await withTransaction(pool, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 501))", [input.name])
        if (await taxesRepository.findByName(tx, input.name)) throw new ApiError(409, 'DUPLICATE_NAME', 'A tax rule with this name already exists')
        const created = await taxesRepository.create(tx, input)
        await writeAudit(tx, { actorUserId: actor.id, action: 'tax.create', entityType: 'tax_rule', entityId: created.id, newValues: created })
        return created
      })
    } catch (error) { return mapError(error) }
  },
  async updateTax(id: string, input: UpdateTaxInput, actor: AuthenticatedUser, pool: Pool = getSharedPool()): Promise<TaxRuleRecord> {
    try {
      return await withTransaction(pool, async (tx) => {
        if (input.name) await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 501))", [input.name])
        const current = await taxesRepository.findById(tx, id, true)
        if (!current) throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
        if (input.name) {
          const other = await taxesRepository.findByName(tx, input.name)
          if (other && other.id !== id) throw new ApiError(409, 'DUPLICATE_NAME', 'A tax rule with this name already exists')
        }
        const updated = (await taxesRepository.update(tx, id, input))!
        await writeAudit(tx, { actorUserId: actor.id, action: input.is_active === false && current.is_active ? 'tax.deactivate' : 'tax.update', entityType: 'tax_rule', entityId: id, oldValues: current, newValues: updated })
        return updated
      })
    } catch (error) { return mapError(error) }
  },
  async deleteTax(id: string, actor: AuthenticatedUser, pool: Pool = getSharedPool()): Promise<void> {
    try {
      await withTransaction(pool, async (tx) => {
        const current = await taxesRepository.findById(tx, id, true)
        if (!current) throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
        await taxesRepository.delete(tx, id)
        await writeAudit(tx, { actorUserId: actor.id, action: 'tax.delete', entityType: 'tax_rule', entityId: id, oldValues: current })
      })
    } catch (error) { mapError(error) }
  },
}
