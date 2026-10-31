export interface TaxRuleRecord {
  id: string
  name: string
  rate: string // formatted e.g. "18.000"
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PaymentTermRecord {
  id: string
  name: string
  due_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuditLogRecord {
  id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string
  old_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
  created_at: string
}

export interface DatabaseState {
  taxRules: Map<string, TaxRuleRecord>
  paymentTerms: Map<string, PaymentTermRecord>
  auditLogs: AuditLogRecord[]
  taxReferences: Set<string> // Set of tax rule IDs referenced by external entities
  nextTaxId: number
  nextTermId: number
  nextAuditId: number
}

export class PostgresError extends Error {
  readonly code: string
  readonly detail?: string

  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'PostgresError'
    this.code = code
    this.detail = detail
  }
}

export interface Transaction {
  // Taxes
  findTaxById(id: string): Promise<TaxRuleRecord | null>
  findTaxByName(name: string): Promise<TaxRuleRecord | null>
  listTaxes(filter?: { isActive?: boolean }): Promise<TaxRuleRecord[]>
  createTax(data: { name: string; rate: string; is_active?: boolean }): Promise<TaxRuleRecord>
  updateTax(
    id: string,
    data: { name?: string; rate?: string; is_active?: boolean },
  ): Promise<TaxRuleRecord | null>
  deleteTax(id: string): Promise<boolean>

  // Payment terms
  findPaymentTermById(id: string): Promise<PaymentTermRecord | null>
  findPaymentTermByName(name: string): Promise<PaymentTermRecord | null>
  listPaymentTerms(filter?: { isActive?: boolean }): Promise<PaymentTermRecord[]>
  createPaymentTerm(data: {
    name: string
    due_days: number
    is_active?: boolean
  }): Promise<PaymentTermRecord>
  updatePaymentTerm(
    id: string,
    data: { name?: string; due_days?: number; is_active?: boolean },
  ): Promise<PaymentTermRecord | null>

  // Audit
  createAuditLog(data: {
    actor_id: string
    action: string
    entity_type: string
    entity_id: string
    old_state?: Record<string, unknown> | null
    new_state?: Record<string, unknown> | null
  }): Promise<AuditLogRecord>

  // Testing helper for FK reference
  addTaxReference(taxId: string): void
  removeTaxReference(taxId: string): void
}

class InMemoryDatabase {
  private state: DatabaseState = {
    taxRules: new Map(),
    paymentTerms: new Map(),
    auditLogs: [],
    taxReferences: new Set(),
    nextTaxId: 1,
    nextTermId: 1,
    nextAuditId: 1,
  }

  constructor() {
    this.seedReferenceData()
  }

  public seedReferenceData(): void {
    // Seed Tax Rules if not already present
    const seedTaxes = [
      { name: 'GST 5%', rate: '5.000' },
      { name: 'GST 12%', rate: '12.000' },
      { name: 'GST 18%', rate: '18.000' },
    ]
    for (const tax of seedTaxes) {
      const exists = Array.from(this.state.taxRules.values()).some(
        (t) => t.name.toLowerCase() === tax.name.toLowerCase(),
      )
      if (!exists) {
        const id = String(this.state.nextTaxId++)
        const now = new Date().toISOString()
        this.state.taxRules.set(id, {
          id,
          name: tax.name,
          rate: tax.rate,
          is_active: true,
          created_at: now,
          updated_at: now,
        })
      }
    }

    // Seed Payment Terms if not already present
    const seedTerms = [
      { name: 'Due on receipt', due_days: 0 },
      { name: 'Net 15', due_days: 15 },
      { name: 'Net 30', due_days: 30 },
    ]
    for (const term of seedTerms) {
      const exists = Array.from(this.state.paymentTerms.values()).some(
        (t) => t.name.toLowerCase() === term.name.toLowerCase(),
      )
      if (!exists) {
        const id = String(this.state.nextTermId++)
        const now = new Date().toISOString()
        this.state.paymentTerms.set(id, {
          id,
          name: term.name,
          due_days: term.due_days,
          is_active: true,
          created_at: now,
          updated_at: now,
        })
      }
    }
  }

  public reset(): void {
    this.state = {
      taxRules: new Map(),
      paymentTerms: new Map(),
      auditLogs: [],
      taxReferences: new Set(),
      nextTaxId: 1,
      nextTermId: 1,
      nextAuditId: 1,
    }
    this.seedReferenceData()
  }

  private cloneState(src: DatabaseState): DatabaseState {
    const taxRules = new Map<string, TaxRuleRecord>()
    for (const [k, v] of src.taxRules.entries()) {
      taxRules.set(k, { ...v })
    }
    const paymentTerms = new Map<string, PaymentTermRecord>()
    for (const [k, v] of src.paymentTerms.entries()) {
      paymentTerms.set(k, { ...v })
    }
    return {
      taxRules,
      paymentTerms,
      auditLogs: [...src.auditLogs.map((l) => ({ ...l }))],
      taxReferences: new Set(src.taxReferences),
      nextTaxId: src.nextTaxId,
      nextTermId: src.nextTermId,
      nextAuditId: src.nextAuditId,
    }
  }

  public async withTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const workingState = this.cloneState(this.state)

    const tx: Transaction = {
      findTaxById: async (id: string) => {
        const item = workingState.taxRules.get(id)
        return item ? { ...item } : null
      },
      findTaxByName: async (name: string) => {
        const item = Array.from(workingState.taxRules.values()).find(
          (t) => t.name.toLowerCase() === name.trim().toLowerCase(),
        )
        return item ? { ...item } : null
      },
      listTaxes: async (filter?: { isActive?: boolean }) => {
        let items = Array.from(workingState.taxRules.values())
        if (filter?.isActive !== undefined) {
          items = items.filter((t) => t.is_active === filter.isActive)
        }
        return items.sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ ...t }))
      },
      createTax: async (data) => {
        // Unique name check
        const existing = Array.from(workingState.taxRules.values()).find(
          (t) => t.name.toLowerCase() === data.name.trim().toLowerCase(),
        )
        if (existing) {
          throw new PostgresError(
            '23505',
            'duplicate key value violates unique constraint "uq_tax_rules_name"',
            `Key (name)=(${data.name}) already exists.`,
          )
        }
        const id = String(workingState.nextTaxId++)
        const now = new Date().toISOString()
        const record: TaxRuleRecord = {
          id,
          name: data.name.trim(),
          rate: data.rate,
          is_active: data.is_active ?? true,
          created_at: now,
          updated_at: now,
        }
        workingState.taxRules.set(id, record)
        return { ...record }
      },
      updateTax: async (id, data) => {
        const current = workingState.taxRules.get(id)
        if (!current) return null

        if (data.name && data.name.trim().toLowerCase() !== current.name.toLowerCase()) {
          const duplicate = Array.from(workingState.taxRules.values()).find(
            (t) => t.id !== id && t.name.toLowerCase() === data.name!.trim().toLowerCase(),
          )
          if (duplicate) {
            throw new PostgresError(
              '23505',
              'duplicate key value violates unique constraint "uq_tax_rules_name"',
              `Key (name)=(${data.name}) already exists.`,
            )
          }
        }

        const now = new Date().toISOString()
        const updated: TaxRuleRecord = {
          ...current,
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.rate !== undefined ? { rate: data.rate } : {}),
          ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
          updated_at: now,
        }
        workingState.taxRules.set(id, updated)
        return { ...updated }
      },
      deleteTax: async (id) => {
        const current = workingState.taxRules.get(id)
        if (!current) return false

        // Check foreign key reference
        if (workingState.taxReferences.has(id)) {
          throw new PostgresError(
            '23503',
            'update or delete on table "tax_rules" violates foreign key constraint',
            `Key (id)=(${id}) is still referenced from table "subscription_items".`,
          )
        }

        workingState.taxRules.delete(id)
        return true
      },

      // Payment Terms
      findPaymentTermById: async (id: string) => {
        const item = workingState.paymentTerms.get(id)
        return item ? { ...item } : null
      },
      findPaymentTermByName: async (name: string) => {
        const item = Array.from(workingState.paymentTerms.values()).find(
          (t) => t.name.toLowerCase() === name.trim().toLowerCase(),
        )
        return item ? { ...item } : null
      },
      listPaymentTerms: async (filter?: { isActive?: boolean }) => {
        let items = Array.from(workingState.paymentTerms.values())
        if (filter?.isActive !== undefined) {
          items = items.filter((t) => t.is_active === filter.isActive)
        }
        return items.sort((a, b) => a.due_days - b.due_days).map((t) => ({ ...t }))
      },
      createPaymentTerm: async (data) => {
        const existing = Array.from(workingState.paymentTerms.values()).find(
          (t) => t.name.toLowerCase() === data.name.trim().toLowerCase(),
        )
        if (existing) {
          throw new PostgresError(
            '23505',
            'duplicate key value violates unique constraint "uq_payment_terms_name"',
            `Key (name)=(${data.name}) already exists.`,
          )
        }
        const id = String(workingState.nextTermId++)
        const now = new Date().toISOString()
        const record: PaymentTermRecord = {
          id,
          name: data.name.trim(),
          due_days: data.due_days,
          is_active: data.is_active ?? true,
          created_at: now,
          updated_at: now,
        }
        workingState.paymentTerms.set(id, record)
        return { ...record }
      },
      updatePaymentTerm: async (id, data) => {
        const current = workingState.paymentTerms.get(id)
        if (!current) return null

        if (data.name && data.name.trim().toLowerCase() !== current.name.toLowerCase()) {
          const duplicate = Array.from(workingState.paymentTerms.values()).find(
            (t) => t.id !== id && t.name.toLowerCase() === data.name!.trim().toLowerCase(),
          )
          if (duplicate) {
            throw new PostgresError(
              '23505',
              'duplicate key value violates unique constraint "uq_payment_terms_name"',
              `Key (name)=(${data.name}) already exists.`,
            )
          }
        }

        const now = new Date().toISOString()
        const updated: PaymentTermRecord = {
          ...current,
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.due_days !== undefined ? { due_days: data.due_days } : {}),
          ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
          updated_at: now,
        }
        workingState.paymentTerms.set(id, updated)
        return { ...updated }
      },

      // Audit logs
      createAuditLog: async (data) => {
        const id = String(workingState.nextAuditId++)
        const record: AuditLogRecord = {
          id,
          actor_id: data.actor_id,
          action: data.action,
          entity_type: data.entity_type,
          entity_id: data.entity_id,
          old_state: data.old_state ?? null,
          new_state: data.new_state ?? null,
          created_at: new Date().toISOString(),
        }
        workingState.auditLogs.push(record)
        return { ...record }
      },

      addTaxReference: (taxId: string) => {
        workingState.taxReferences.add(taxId)
      },
      removeTaxReference: (taxId: string) => {
        workingState.taxReferences.delete(taxId)
      },
    }

    const result = await fn(tx)
    // Commit state
    this.state = workingState
    return result
  }

  public getAuditLogs(): AuditLogRecord[] {
    return [...this.state.auditLogs]
  }

  public addTaxReference(taxId: string): void {
    this.state.taxReferences.add(taxId)
  }

  public removeTaxReference(taxId: string): void {
    this.state.taxReferences.delete(taxId)
  }
}

export const db = new InMemoryDatabase()
export const withTransaction = db.withTransaction.bind(db)
