import { withTransaction, type PaymentTermRecord } from '../../db/client.js'
import { ApiError } from '../../middleware/error-handler.js'
import { audit } from '../../lib/audit.js'
import { paymentTermsRepository } from './payment-terms.repository.js'
import type { CreatePaymentTermInput, UpdatePaymentTermInput } from './payment-terms.schemas.js'
import type { AuthenticatedUser } from '../../middleware/authenticate.js'

export const paymentTermsService = {
  async listPaymentTerms(filter?: { isActive?: boolean }): Promise<PaymentTermRecord[]> {
    return paymentTermsRepository.list(filter)
  },

  async getPaymentTermById(id: string): Promise<PaymentTermRecord> {
    const term = await paymentTermsRepository.findById(id)
    if (!term) {
      throw new ApiError(404, 'NOT_FOUND', `Payment term with id ${id} not found`)
    }
    return term
  },

  async createPaymentTerm(
    input: CreatePaymentTermInput,
    actor: AuthenticatedUser,
  ): Promise<PaymentTermRecord> {
    return withTransaction(async (tx) => {
      const existing = await paymentTermsRepository.findByName(input.name, tx)
      if (existing) {
        throw new ApiError(409, 'DUPLICATE_NAME', `A payment term with name "${input.name}" already exists`)
      }

      const created = await paymentTermsRepository.create(
        {
          name: input.name,
          due_days: input.due_days,
          is_active: input.is_active ?? true,
        },
        tx,
      )

      await audit.log(tx, {
        actor,
        action: 'payment_term.create',
        entityType: 'payment_term',
        entityId: created.id,
        new: created as unknown as Record<string, unknown>,
      })

      return created
    })
  },

  async updatePaymentTerm(
    id: string,
    input: UpdatePaymentTermInput,
    actor: AuthenticatedUser,
  ): Promise<PaymentTermRecord> {
    return withTransaction(async (tx) => {
      const current = await paymentTermsRepository.findById(id, tx)
      if (!current) {
        throw new ApiError(404, 'NOT_FOUND', `Payment term with id ${id} not found`)
      }

      if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
        const existing = await paymentTermsRepository.findByName(input.name, tx)
        if (existing && existing.id !== id) {
          throw new ApiError(409, 'DUPLICATE_NAME', `A payment term with name "${input.name}" already exists`)
        }
      }

      const updated = await paymentTermsRepository.update(id, input, tx)
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', `Payment term with id ${id} not found`)
      }

      const action =
        input.is_active === false && current.is_active === true
          ? 'payment_term.deactivate'
          : 'payment_term.update'

      await audit.log(tx, {
        actor,
        action,
        entityType: 'payment_term',
        entityId: id,
        old: current as unknown as Record<string, unknown>,
        new: updated as unknown as Record<string, unknown>,
      })

      return updated
    })
  },
}
