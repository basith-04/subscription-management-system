import { withTransaction, PostgresError, type TaxRuleRecord } from '../../db/client.js'
import { ApiError } from '../../middleware/error-handler.js'
import { audit } from '../../lib/audit.js'
import { taxesRepository } from './taxes.repository.js'
import type { CreateTaxInput, UpdateTaxInput } from './taxes.schemas.js'
import type { AuthenticatedUser } from '../../middleware/authenticate.js'

export const taxesService = {
  async listTaxes(filter?: { isActive?: boolean }): Promise<TaxRuleRecord[]> {
    return taxesRepository.list(filter)
  },

  async getTaxById(id: string): Promise<TaxRuleRecord> {
    const tax = await taxesRepository.findById(id)
    if (!tax) {
      throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
    }
    return tax
  },

  async createTax(input: CreateTaxInput, actor: AuthenticatedUser): Promise<TaxRuleRecord> {
    return withTransaction(async (tx) => {
      const existing = await taxesRepository.findByName(input.name, tx)
      if (existing) {
        throw new ApiError(409, 'DUPLICATE_NAME', `A tax rule with name "${input.name}" already exists`)
      }

      const created = await taxesRepository.create(
        {
          name: input.name,
          rate: input.rate,
          is_active: input.is_active ?? true,
        },
        tx,
      )

      await audit.log(tx, {
        actor,
        action: 'tax.create',
        entityType: 'tax_rule',
        entityId: created.id,
        new: created as unknown as Record<string, unknown>,
      })

      return created
    })
  },

  async updateTax(
    id: string,
    input: UpdateTaxInput,
    actor: AuthenticatedUser,
  ): Promise<TaxRuleRecord> {
    return withTransaction(async (tx) => {
      const current = await taxesRepository.findById(id, tx)
      if (!current) {
        throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
      }

      if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
        const existing = await taxesRepository.findByName(input.name, tx)
        if (existing && existing.id !== id) {
          throw new ApiError(409, 'DUPLICATE_NAME', `A tax rule with name "${input.name}" already exists`)
        }
      }

      const updated = await taxesRepository.update(id, input, tx)
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
      }

      const action =
        input.is_active === false && current.is_active === true
          ? 'tax.deactivate'
          : 'tax.update'

      await audit.log(tx, {
        actor,
        action,
        entityType: 'tax_rule',
        entityId: id,
        old: current as unknown as Record<string, unknown>,
        new: updated as unknown as Record<string, unknown>,
      })

      return updated
    })
  },

  async deleteTax(id: string, actor: AuthenticatedUser): Promise<void> {
    return withTransaction(async (tx) => {
      const current = await taxesRepository.findById(id, tx)
      if (!current) {
        throw new ApiError(404, 'NOT_FOUND', `Tax rule with id ${id} not found`)
      }

      try {
        await taxesRepository.delete(id, tx)
      } catch (error) {
        if (error instanceof PostgresError && error.code === '23503') {
          throw new ApiError(409, 'IN_USE', 'Deactivate it instead')
        }
        throw error
      }

      await audit.log(tx, {
        actor,
        action: 'tax.delete',
        entityType: 'tax_rule',
        entityId: id,
        old: current as unknown as Record<string, unknown>,
      })
    })
  },
}
