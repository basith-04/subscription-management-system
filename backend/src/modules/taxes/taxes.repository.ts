import { withTransaction, type TaxRuleRecord, type Transaction } from '../../db/client.js'

export const taxesRepository = {
  async list(filter?: { isActive?: boolean }, tx?: Transaction): Promise<TaxRuleRecord[]> {
    if (tx) {
      return tx.listTaxes(filter)
    }
    return withTransaction((t) => t.listTaxes(filter))
  },

  async findById(id: string, tx?: Transaction): Promise<TaxRuleRecord | null> {
    if (tx) {
      return tx.findTaxById(id)
    }
    return withTransaction((t) => t.findTaxById(id))
  },

  async findByName(name: string, tx?: Transaction): Promise<TaxRuleRecord | null> {
    if (tx) {
      return tx.findTaxByName(name)
    }
    return withTransaction((t) => t.findTaxByName(name))
  },

  async create(
    data: { name: string; rate: string; is_active?: boolean },
    tx?: Transaction,
  ): Promise<TaxRuleRecord> {
    if (tx) {
      return tx.createTax(data)
    }
    return withTransaction((t) => t.createTax(data))
  },

  async update(
    id: string,
    data: { name?: string; rate?: string; is_active?: boolean },
    tx?: Transaction,
  ): Promise<TaxRuleRecord | null> {
    if (tx) {
      return tx.updateTax(id, data)
    }
    return withTransaction((t) => t.updateTax(id, data))
  },

  async delete(id: string, tx?: Transaction): Promise<boolean> {
    if (tx) {
      return tx.deleteTax(id)
    }
    return withTransaction((t) => t.deleteTax(id))
  },
}
