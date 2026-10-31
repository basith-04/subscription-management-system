// Business rules and transactions for payments (F13): record, get, list, void, listForInvoice.
// Invoice state changes go through the F11 entry points (invoices.payment-sync); this module never
// issues UPDATE invoices … SET status itself.
import type { Pool } from 'pg'
import { writeAudit } from '../../lib/audit.js'
import { isPgError, withTransaction, type Queryable } from '../../lib/db.js'
import { ApiError, type FieldError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import { OVERDUE_GRACE_DAYS, type InvoiceStatus, type PaymentState } from '../invoices/invoices.constants.js'
import { derivePaymentState, todayInBusinessTimezone } from '../invoices/invoices.payment-state.js'
import { activeAllocationTotal, applyPaidAmount, lockInvoicesForPayment, type AppliedBalance, type PaymentInvoiceRow } from '../invoices/invoices.payment-sync.js'
import { invalidTransition } from '../invoices/invoices.state-machine.js'
import { validateAllocations, type AllocationIssue } from './payments.calc.js'
import { DUPLICATE_WINDOW_SECONDS, PAYMENT_AUDIT, PAYMENT_ENTITY, PAYMENT_ERROR_CODES, type PaymentMethod } from './payments.constants.js'
import * as repo from './payments.repository.js'
import type { ListPaymentsQuery, RecordPaymentInput, VoidPaymentInput } from './payments.schemas.js'

export interface Actor { id: number; role: string; ip: string | null }

export interface PaymentDto {
  id: number
  customer: { id: number; name: string }
  method: PaymentMethod
  amount: string
  payment_date: string
  note: string | null
  reference_number: string | null
  source: string
  is_voided: boolean
  voided_at: string | null
  void_reason: string | null
  recorded_by: number | null
  created_at: string
  allocations: Array<{ invoice_id: number; invoice_number: string; amount: string }>
}

export interface AffectedInvoiceDto {
  id: number
  number: string
  status: InvoiceStatus
  payment_state: PaymentState
  amount_paid: string
  amount_due: string
}
export type PaymentWithInvoices = PaymentDto & { invoices: AffectedInvoiceDto[] }

const iso = (d: Date | null) => (d ? d.toISOString() : null)

function toDto(r: repo.PaymentRow, allocs: repo.AllocationRow[]): PaymentDto {
  return {
    id: Number(r.id),
    customer: { id: Number(r.customer_id), name: r.customer_name },
    method: r.method, amount: r.amount, payment_date: r.payment_date, note: r.note, reference_number: r.reference_number,
    source: r.source, is_voided: r.voided_at !== null, voided_at: iso(r.voided_at), void_reason: r.void_reason,
    recorded_by: r.recorded_by === null ? null : Number(r.recorded_by), created_at: r.created_at.toISOString(),
    allocations: allocs.filter((a) => a.payment_id === r.id).map((a) => ({ invoice_id: Number(a.invoice_id), invoice_number: a.invoice_number, amount: a.amount })),
  }
}

async function loadPayment(db: Queryable, id: number): Promise<PaymentDto> {
  const row = await repo.findPayment(db, id)
  if (!row) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Payment not found')
  return toDto(row, await repo.allocationsFor(db, [id]))
}

function affected(invoice: PaymentInvoiceRow, applied: AppliedBalance, today: string): AffectedInvoiceDto {
  return {
    id: invoice.id, number: invoice.number, status: applied.status,
    payment_state: derivePaymentState({ status: applied.status, amount_paid: applied.amount_paid, amount_due: applied.amount_due, due_date: invoice.due_date }, today, OVERDUE_GRACE_DAYS),
    amount_paid: applied.amount_paid, amount_due: applied.amount_due,
  }
}

const detailsOf = (issues: AllocationIssue[]): FieldError[] => issues.map((i) => ({ field: i.field, message: i.message }))

/** Map the most severe allocation problem to the documented HTTP error. */
function throwForIssues(issues: AllocationIssue[]): never {
  const has = (code: AllocationIssue['code']) => issues.filter((i) => i.code === code)
  if (has('UNKNOWN_INVOICE').length) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Invoice not found', detailsOf(has('UNKNOWN_INVOICE')))
  if (has('INVOICE_NOT_CONFIRMED').length) {
    throw new ApiError(409, PAYMENT_ERROR_CODES.INVALID_STATE_TRANSITION, has('INVOICE_NOT_CONFIRMED')[0]!.message, detailsOf(has('INVOICE_NOT_CONFIRMED')))
  }
  if (has('MIXED_CUSTOMERS').length || has('DUPLICATE_INVOICE').length) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid allocations', detailsOf([...has('MIXED_CUSTOMERS'), ...has('DUPLICATE_INVOICE')]))
  }
  if (has('ALLOCATION_EXCEEDS_AMOUNT_DUE').length) {
    throw new ApiError(422, PAYMENT_ERROR_CODES.ALLOCATION_EXCEEDS_AMOUNT_DUE, has('ALLOCATION_EXCEEDS_AMOUNT_DUE')[0]!.message, detailsOf(has('ALLOCATION_EXCEEDS_AMOUNT_DUE')))
  }
  throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid allocations', detailsOf(issues))
}

const duplicateReference = () => new ApiError(409, PAYMENT_ERROR_CODES.DUPLICATE_PAYMENT_REFERENCE, 'A payment with this method and reference number already exists', [{ field: 'reference_number', message: 'This reference has already been recorded' }])

// ── record ──

export async function record(pool: Pool, input: RecordPaymentInput, actor: Actor, now: Date = new Date()): Promise<PaymentWithInvoices> {
  const today = todayInBusinessTimezone(now)
  if (input.payment_date > today) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', [{ field: 'payment_date', message: 'Payment date cannot be in the future' }])
  }
  try {
    return await withTransaction(pool, async (tx) => {
      // 1. Lock every affected invoice (id order) so concurrent payments serialise on the balance.
      const locked = await lockInvoicesForPayment(tx, input.allocations.map((a) => a.invoice_id))
      const byId = new Map(locked.map((i) => [i.id, i]))
      const issues = validateAllocations(input.amount, input.allocations, byId)
      if (issues.length) throwForIssues(issues)

      const customerId = locked[0]!.customer_id
      if (input.reference_number) {
        const dup = await tx.query('SELECT 1 FROM payments WHERE method = $1 AND reference_number = $2 AND voided_at IS NULL', [input.method, input.reference_number])
        if (dup.rowCount) throw duplicateReference()
      }
      if (!input.confirm_duplicate) {
        const recent = await repo.findRecentDuplicate(tx, {
          customer_id: customerId, method: input.method, amount: input.amount, payment_date: input.payment_date,
          invoice_ids: input.allocations.map((a) => a.invoice_id), windowSeconds: DUPLICATE_WINDOW_SECONDS,
        })
        if (recent !== null) {
          throw new ApiError(409, PAYMENT_ERROR_CODES.POSSIBLE_DUPLICATE_PAYMENT,
            `An identical payment was recorded in the last ${DUPLICATE_WINDOW_SECONDS} seconds. Resend with confirm_duplicate to record it anyway.`)
        }
      }

      // 2. Payment + allocations.
      const paymentId = await repo.insertPayment(tx, {
        customer_id: customerId, method: input.method, amount: input.amount, payment_date: input.payment_date,
        note: input.note ?? null, reference_number: input.reference_number ?? null, recorded_by: actor.id,
      })
      for (const a of input.allocations) await repo.insertAllocation(tx, paymentId, a.invoice_id, a.amount)

      // 3. Re-derive each invoice's paid amount from the allocations, then move its status via F11.
      const changes: AffectedInvoiceDto[] = []
      for (const inv of locked) {
        const applied = await applyPaidAmount(tx, inv, await activeAllocationTotal(tx, inv.id))
        changes.push(affected(inv, applied, today))
        if (applied.status !== applied.previous_status) {
          await writeAudit(tx, { actorUserId: actor.id, action: PAYMENT_AUDIT.invoicePaid, entityType: 'invoice', entityId: inv.id,
            oldValues: { status: applied.previous_status }, newValues: { status: applied.status, payment_id: paymentId }, ipAddress: actor.ip })
        }
      }
      await writeAudit(tx, { actorUserId: actor.id, action: PAYMENT_AUDIT.record, entityType: PAYMENT_ENTITY, entityId: paymentId,
        newValues: { customer_id: customerId, method: input.method, amount: input.amount, payment_date: input.payment_date,
          allocations: input.allocations, has_reference: Boolean(input.reference_number) }, ipAddress: actor.ip })
      return { ...(await loadPayment(tx, paymentId)), invoices: changes }
    })
  } catch (error) {
    // The partial unique index is the last line of defence against a racing duplicate reference.
    if (isPgError(error) && error.code === '23505' && error.constraint === 'uq_payments_method_reference') throw duplicateReference()
    throw error
  }
}

// ── reads ──

export function get(pool: Pool, id: number): Promise<PaymentDto> {
  return loadPayment(pool, id)
}

export async function list(pool: Pool, q: ListPaymentsQuery): Promise<{ data: PaymentDto[]; meta: PageMeta }> {
  const page = q.page ?? 1
  const size = q.page_size ?? 20
  const { page: _p, page_size: _s, sort, ...filters } = q
  const { rows, total } = await repo.listPayments(pool, filters, { ...(sort ? { sort } : {}), limit: size, offset: (page - 1) * size })
  const allocs = await repo.allocationsFor(pool, rows.map((r) => Number(r.id)))
  return { data: rows.map((r) => toDto(r, allocs)), meta: buildMeta(total, page, size) }
}

export async function listForInvoice(pool: Pool, invoiceId: number): Promise<PaymentDto[]> {
  if (!(await repo.invoiceExists(pool, invoiceId))) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Invoice not found')
  const rows = await repo.listForInvoice(pool, invoiceId)
  const allocs = await repo.allocationsFor(pool, rows.map((r) => Number(r.id)))
  return rows.map((r) => toDto(r, allocs))
}

// ── void ──

export async function voidPayment(pool: Pool, id: number, input: VoidPaymentInput, actor: Actor, now: Date = new Date()): Promise<PaymentWithInvoices> {
  const today = todayInBusinessTimezone(now)
  return withTransaction(pool, async (tx) => {
    const payment = await repo.findPayment(tx, id, { forUpdate: true })
    if (!payment) throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Payment not found')
    if (payment.voided_at) {
      throw new ApiError(409, PAYMENT_ERROR_CODES.INVALID_STATE_TRANSITION, 'This payment has already been voided')
    }
    const locked = await lockInvoicesForPayment(tx, await repo.invoiceIdsOfPayment(tx, id))
    if (!(await repo.markVoided(tx, id, input.reason))) {
      throw new ApiError(409, PAYMENT_ERROR_CODES.INVALID_STATE_TRANSITION, 'This payment has already been voided')
    }
    // Allocation rows stay as history; they stop counting because their payment is now voided.
    const changes: AffectedInvoiceDto[] = []
    for (const inv of locked) {
      if (inv.status !== 'confirmed' && inv.status !== 'paid') throw invalidTransition(inv.status, 'confirmed', `invoice ${inv.number} cannot be reopened`)
      const applied = await applyPaidAmount(tx, inv, await activeAllocationTotal(tx, inv.id))
      changes.push(affected(inv, applied, today))
      if (applied.status !== applied.previous_status) {
        await writeAudit(tx, { actorUserId: actor.id, action: PAYMENT_AUDIT.invoiceReopened, entityType: 'invoice', entityId: inv.id,
          oldValues: { status: applied.previous_status }, newValues: { status: applied.status, payment_id: id }, ipAddress: actor.ip })
      }
    }
    await writeAudit(tx, { actorUserId: actor.id, action: PAYMENT_AUDIT.void, entityType: PAYMENT_ENTITY, entityId: id,
      oldValues: { voided: false }, newValues: { voided: true, reason: input.reason, amount: payment.amount }, ipAddress: actor.ip })
    return { ...(await loadPayment(tx, id)), invoices: changes }
  })
}

// ── outstanding / overdue (consumed by F04 customer detail and F16) ──

export interface BalanceTotals { outstanding_amount: string; overdue_amount: string; outstanding_count: number; overdue_count: number }

/**
 * Outstanding = confirmed invoices with amount_due > 0 (not_due, outstanding, partially_paid, overdue).
 * Overdue = the subset whose payment_state is `overdue` (single definition from the F11 helper).
 * Voided payments never count: amount_due derives from active allocations only.
 * Returns null when the invoices table is not migrated yet.
 */
export async function getBalanceTotals(db: Queryable, opts: { customerId?: number } = {}, now: Date = new Date()): Promise<BalanceTotals | null> {
  if (!(await repo.invoicesTableExists(db))) return null
  return repo.balanceTotals(db, opts, todayInBusinessTimezone(now), OVERDUE_GRACE_DAYS)
}
