import { withTransaction, type PaymentTermRecord, type Transaction } from '../../db/client.js'

export const paymentTermsRepository = {
  async list(filter?: { isActive?: boolean }, tx?: Transaction): Promise<PaymentTermRecord[]> {
    if (tx) {
      return tx.listPaymentTerms(filter)
    }
    return withTransaction((t) => t.listPaymentTerms(filter))
  },

  async findById(id: string, tx?: Transaction): Promise<PaymentTermRecord | null> {
    if (tx) {
      return tx.findPaymentTermById(id)
    }
    return withTransaction((t) => t.findPaymentTermById(id))
  },

  async findByName(name: string, tx?: Transaction): Promise<PaymentTermRecord | null> {
    if (tx) {
      return tx.findPaymentTermByName(name)
    }
    return withTransaction((t) => t.findPaymentTermByName(name))
  },

  async create(
    data: { name: string; due_days: number; is_active?: boolean },
    tx?: Transaction,
  ): Promise<PaymentTermRecord> {
    if (tx) {
      return tx.createPaymentTerm(data)
    }
    return withTransaction((t) => t.createPaymentTerm(data))
  },

  async update(
    id: string,
    data: { name?: string; due_days?: number; is_active?: boolean },
    tx?: Transaction,
  ): Promise<PaymentTermRecord | null> {
    if (tx) {
      return tx.updatePaymentTerm(id, data)
    }
    return withTransaction((t) => t.updatePaymentTerm(id, data))
  },
}
