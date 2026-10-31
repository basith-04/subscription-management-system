// Business rules and transactions for customers.
import type { Pool } from 'pg'
import { withTransaction, type Queryable } from '../../lib/db.js'
import { writeAudit } from '../../lib/audit.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { ApiError } from '../../lib/errors.js'
import { buildMeta, parsePagination } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import { getBalanceTotals } from '../payments/index.js'
import { ADDRESS_COLUMNS, ADDRESS_KEYS, CUSTOMER_AUDIT, type AddressKey } from './customers.constants.js'
import * as repo from './customers.repository.js'
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
  UpdateOwnProfileInput,
} from './customers.schemas.js'

export interface Actor {
  id: number
  role: string
  ip?: string | null
}

export interface Warning {
  field: string
  message: string
}

export type CustomerAddress = Record<AddressKey, string | null>

/** Back-office customer shape (list rows use the subset marked below). */
export interface CustomerDto {
  id: number
  name: string
  company_name: string | null
  email: string
  phone: string | null
  address: CustomerAddress
  tax_id: string | null
  notes: string | null
  is_active: boolean
  /** True when the customer has a portal login. The login id itself is never exposed. */
  has_portal_login: boolean
  warnings?: Warning[]
}

export type CustomerListItemDto = Pick<CustomerDto, 'id' | 'name' | 'company_name' | 'email' | 'phone' | 'is_active'>

/**
 * Detail adds summary fields owned by later features. They are `null` until F09 (subscriptions_count)
 * and F13 (outstanding_amount, overdue_amount) fill them in; they are never fabricated here.
 */
export interface CustomerDetailDto extends CustomerDto {
  subscriptions_count: number | null
  outstanding_amount: string | null
  overdue_amount: string | null
}

/** What a customer sees of themselves: no staff notes, no login id, no active flag. */
export type OwnProfileDto = Omit<CustomerDto, 'notes' | 'is_active' | 'has_portal_login' | 'warnings'>

function toAddress(row: repo.CustomerRow): CustomerAddress {
  const address = {} as CustomerAddress
  for (const key of ADDRESS_KEYS) address[key] = row[ADDRESS_COLUMNS[key] as keyof repo.CustomerRow] as string | null
  return address
}

export function toCustomerDto(row: repo.CustomerRow): CustomerDto {
  return {
    id: Number(row.id),
    name: row.name,
    company_name: row.company_name,
    email: row.email,
    phone: row.phone,
    address: toAddress(row),
    tax_id: row.tax_id,
    notes: row.notes,
    is_active: row.is_active,
    has_portal_login: row.user_id !== null,
  }
}

function toOwnProfileDto(row: repo.CustomerRow): OwnProfileDto {
  const { notes: _n, is_active: _a, has_portal_login: _l, warnings: _w, ...rest } = toCustomerDto(row)
  return rest
}

const SORT_COLUMNS: Record<string, string> = { name: 'name', created_at: 'id' }

function orderBy(sort: string | undefined): string {
  const parts = (sort ?? 'name').split(',').map((f) => `${SORT_COLUMNS[f.replace(/^-/, '')]} ${f.startsWith('-') ? 'DESC' : 'ASC'}`)
  return [...parts, 'id ASC'].join(', ')
}

export async function list(query: ListCustomersQuery, db: Queryable): Promise<{ data: CustomerListItemDto[]; meta: PageMeta }> {
  const { page, page_size, limit, offset } = parsePagination(query)
  const { rows, total } = await repo.listCustomers(db, query, orderBy(query.sort), limit, offset)
  return {
    data: rows.map((r) => {
      const { id, name, company_name, email, phone, is_active } = toCustomerDto(r)
      return { id, name, company_name, email, phone, is_active }
    }),
    meta: buildMeta(total, page, page_size),
  }
}

const duplicateEmailWarning = (): Warning => ({
  field: 'email',
  message: 'Another customer record uses this email. Both records were kept.',
})

export async function create(pool: Pool, input: CreateCustomerInput, actor: Actor): Promise<CustomerDto> {
  return withTransaction(pool, async (tx) => {
    const duplicate = await repo.emailInUse(tx, input.email)
    const row = await repo.insertCustomer(tx, input)
    const dto = toCustomerDto(row)
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: CUSTOMER_AUDIT.create,
      entityType: 'customer',
      entityId: dto.id,
      newValues: auditValues(row),
      ipAddress: actor.ip ?? null,
    })
    return duplicate ? { ...dto, warnings: [duplicateEmailWarning()] } : dto
  })
}

async function requireCustomer(db: Queryable, id: number, lock = false): Promise<repo.CustomerRow> {
  const row = await repo.findById(db, id, lock)
  if (!row) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Customer not found')
  return row
}

export async function get(id: number, db: Queryable): Promise<CustomerDetailDto> {
  const dto = toCustomerDto(await requireCustomer(db, id))
  // F13 fills the outstanding/overdue totals (null only while the invoices table is not migrated).
  const balances = await getBalanceTotals(db, { customerId: id })
  return {
    ...dto,
    subscriptions_count: null,
    outstanding_amount: balances?.outstanding_amount ?? null,
    overdue_amount: balances?.overdue_amount ?? null,
  }
}

type ChangeSet = Record<string, unknown>

/** Map API-shaped input to column changes, dropping values equal to the stored ones. */
function diffChanges(row: repo.CustomerRow, input: UpdateCustomerInput | UpdateOwnProfileInput): ChangeSet {
  const wanted: ChangeSet = {}
  const flat = input as Record<string, unknown>
  for (const key of ['name', 'company_name', 'phone', 'email', 'tax_id', 'notes', 'is_active']) {
    if (flat[key] !== undefined) wanted[key] = flat[key]
  }
  const address = (flat.address ?? {}) as Partial<Record<AddressKey, string | null>>
  for (const key of ADDRESS_KEYS) {
    if (address[key] !== undefined) wanted[ADDRESS_COLUMNS[key]] = address[key]
  }
  const changes: ChangeSet = {}
  for (const [column, value] of Object.entries(wanted)) {
    const current = row[column as keyof repo.CustomerRow]
    const same = column === 'email' ? String(current).toLowerCase() === String(value) : current === value
    if (!same) changes[column] = value
  }
  return changes
}

function auditValues(row: repo.CustomerRow, columns?: string[]): Record<string, unknown> {
  const { user_id: _u, id: _i, ...rest } = row
  if (!columns) return rest
  return Object.fromEntries(columns.map((c) => [c, rest[c as keyof typeof rest]]))
}

/**
 * Back-office update. Last write wins: there is no version column or optimistic locking
 * (documented decision). Only Admin may send `is_active`.
 */
export async function update(pool: Pool, id: number, input: UpdateCustomerInput, actor: Actor): Promise<CustomerDto> {
  if (input.is_active !== undefined && actor.role !== 'admin') {
    throw new ApiError(403, ERROR_CODES.FORBIDDEN, 'Only an administrator can activate or deactivate customers')
  }
  return withTransaction(pool, async (tx) => {
    const before = await requireCustomer(tx, id, true)
    const changes = diffChanges(before, input)
    if (Object.keys(changes).length === 0) return toCustomerDto(before)

    const after = await repo.updateColumns(tx, id, changes)
    const columns = Object.keys(changes)
    const warnings: Warning[] = []

    const profileColumns = columns.filter((c) => c !== 'is_active')
    if (profileColumns.length > 0) {
      await writeAudit(tx, {
        actorUserId: actor.id, action: CUSTOMER_AUDIT.update, entityType: 'customer', entityId: id,
        oldValues: auditValues(before, profileColumns), newValues: auditValues(after, profileColumns), ipAddress: actor.ip ?? null,
      })
    }
    if (columns.includes('email') && (await repo.emailInUse(tx, after.email, id))) warnings.push(duplicateEmailWarning())

    if (columns.includes('is_active')) {
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: after.is_active ? CUSTOMER_AUDIT.reactivate : CUSTOMER_AUDIT.deactivate,
        entityType: 'customer', entityId: id,
        oldValues: { is_active: before.is_active }, newValues: { is_active: after.is_active }, ipAddress: actor.ip ?? null,
      })
      if (!after.is_active) {
        const active = await repo.countActiveSubscriptions(tx, id)
        if (active) {
          warnings.push({
            field: 'is_active',
            message: `This customer has ${active} active subscription(s). They are not affected by deactivation.`,
          })
        }
      }
    }
    const dto = toCustomerDto(after)
    return warnings.length ? { ...dto, warnings } : dto
  })
}

export async function getOwnProfile(customerId: number, db: Queryable): Promise<OwnProfileDto> {
  return toOwnProfileDto(await requireCustomer(db, customerId))
}

/** `customerId` MUST come from the authenticated session (scopeToCustomer), never from the request. */
export async function updateOwnProfile(pool: Pool, customerId: number, input: UpdateOwnProfileInput, actor: Actor): Promise<OwnProfileDto> {
  return withTransaction(pool, async (tx) => {
    const before = await requireCustomer(tx, customerId, true)
    const changes = diffChanges(before, input)
    if (Object.keys(changes).length === 0) return toOwnProfileDto(before)
    const after = await repo.updateColumns(tx, customerId, changes)
    const columns = Object.keys(changes)
    await writeAudit(tx, {
      actorUserId: actor.id, action: CUSTOMER_AUDIT.profileUpdate, entityType: 'customer', entityId: customerId,
      oldValues: auditValues(before, columns), newValues: auditValues(after, columns), ipAddress: actor.ip ?? null,
    })
    return toOwnProfileDto(after)
  })
}
