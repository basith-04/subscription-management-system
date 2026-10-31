// Business rules and transactions for invoices.
// F11 owns: list, get, updateDraft, confirm, bulkConfirm, cancel, send, renderPrint.
// Invoices are CREATED by F12 (billing engine); payments (amount_paid, confirmed↔paid) belong to F13.
import type { Pool } from 'pg'
import { writeAudit } from '../../lib/audit.js'
import { withTransaction, type Queryable } from '../../lib/db.js'
import { ApiError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import type { EmailMessage, MailResult } from '../../lib/mailer.js'
import { buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import {
  INVOICE_AUDIT,
  INVOICE_ENTITY,
  INVOICE_ERROR_CODES,
  OVERDUE_GRACE_DAYS,
  type InvoiceStatus,
  type PaymentState,
} from './invoices.constants.js'
import { renderInvoiceHtml, renderInvoiceText } from './invoices.document.js'
import { invoiceHooks } from './invoices.hooks.js'
import { derivePaymentState, todayInBusinessTimezone } from './invoices.payment-state.js'
import * as repo from './invoices.repository.js'
import type { BulkConfirmInput, CancelInput, ListInvoicesQuery, SendInput, UpdateDraftInput } from './invoices.schemas.js'
import { SENDABLE_STATUSES, canTransition, invalidTransition } from './invoices.state-machine.js'

export interface Actor {
  id: number
  role: string
  ip: string | null
}

export interface Mailer {
  sendMail(message: EmailMessage): Promise<MailResult>
}

export interface InvoiceListItemDto {
  id: number
  number: string
  customer: { id: number; name: string }
  subscription_id: number
  status: InvoiceStatus
  payment_state: PaymentState
  issue_date: string
  due_date: string
  total: string
  amount_paid: string
  amount_due: string
  sent_at: string | null
}

export interface InvoiceItemDto {
  id: number
  description: string
  quantity: number
  unit_price: string
  line_subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_name: string | null
  tax_rate: string
  tax_amount: string
  line_total: string
}

export interface InvoiceDetailDto {
  id: number
  number: string
  status: InvoiceStatus
  payment_state: PaymentState
  subscription: { id: number; number: string | null }
  billing_run_id: number | null
  /** Snapshot stored on the invoice; later customer edits never change it. */
  customer: {
    id: number
    name: string
    email: string
    tax_id: string | null
    billing_address: Record<string, unknown> | null
  }
  period_start: string
  period_end: string
  issue_date: string
  due_date: string
  payment_term: string
  notes: string | null
  items: InvoiceItemDto[]
  tax_details: Array<{ tax_name: string; tax_rate: string; taxable_amount: string; tax_amount: string }>
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  amount_due: string
  confirmed_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  sent_at: string | null
  created_at: string
  /** UI hints derived from state only; the server re-checks every action. */
  can_edit: boolean
  can_confirm: boolean
  can_cancel: boolean
  can_send: boolean
}

export interface ListInvoicesResult {
  data: InvoiceListItemDto[]
  meta: PageMeta & { summary: repo.ListSummary }
}

export interface BulkConfirmResult {
  confirmed: number[]
  failed: Array<{ id: number; code: string }>
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

const notFound = () => new ApiError(404, ERROR_CODES.NOT_FOUND, 'Invoice not found')

function toListItem(r: repo.ListRow): InvoiceListItemDto {
  return {
    id: Number(r.id),
    number: r.number,
    customer: { id: Number(r.customer_id), name: r.customer_name },
    subscription_id: Number(r.subscription_id),
    status: r.status,
    payment_state: r.payment_state,
    issue_date: r.issue_date,
    due_date: r.due_date,
    total: r.total,
    amount_paid: r.amount_paid,
    amount_due: r.amount_due,
    sent_at: iso(r.sent_at),
  }
}

async function loadDetail(db: Queryable, id: number, now: Date): Promise<InvoiceDetailDto> {
  const row = await repo.findInvoice(db, id)
  if (!row) throw notFound()
  // Sequential on purpose: `db` may be a single transaction client, which cannot run queries concurrently.
  const items = await repo.listItems(db, id)
  const taxes = await repo.listTaxDetails(db, id)
  const subNumber = await repo.subscriptionNumber(db, Number(row.subscription_id))
  return toDetail(row, items, taxes, subNumber, now)
}

function toDetail(
  row: repo.InvoiceRow,
  items: repo.InvoiceItemRow[],
  taxes: repo.InvoiceTaxDetailRow[],
  subscriptionNumber: string | null,
  now: Date,
): InvoiceDetailDto {
  const state = derivePaymentState(row, todayInBusinessTimezone(now), OVERDUE_GRACE_DAYS)
  return {
    id: Number(row.id),
    number: row.number,
    status: row.status,
    payment_state: state,
    subscription: { id: Number(row.subscription_id), number: subscriptionNumber },
    billing_run_id: row.billing_run_id === null ? null : Number(row.billing_run_id),
    customer: {
      id: Number(row.customer_id),
      name: row.customer_name,
      email: row.customer_email,
      tax_id: row.customer_tax_id,
      billing_address: row.billing_address,
    },
    period_start: row.period_start,
    period_end: row.period_end,
    issue_date: row.issue_date,
    due_date: row.due_date,
    payment_term: row.payment_term_name,
    notes: row.notes,
    items: items.map((i) => ({
      id: Number(i.id),
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_subtotal: i.line_subtotal,
      discount_amount: i.discount_amount,
      taxable_amount: i.taxable_amount,
      tax_name: i.tax_name,
      tax_rate: i.tax_rate,
      tax_amount: i.tax_amount,
      line_total: i.line_total,
    })),
    tax_details: taxes,
    subtotal: row.subtotal,
    discount_total: row.discount_total,
    tax_total: row.tax_total,
    total: row.total,
    amount_paid: row.amount_paid,
    amount_due: row.amount_due,
    confirmed_at: iso(row.confirmed_at),
    paid_at: iso(row.paid_at),
    cancelled_at: iso(row.cancelled_at),
    cancel_reason: row.cancel_reason,
    sent_at: iso(row.sent_at),
    created_at: row.created_at.toISOString(),
    can_edit: row.status === 'draft',
    can_confirm: canTransition(row.status, 'confirmed'),
    // Cancel is offered for drafts and unpaid confirmed invoices; amount_paid > 0 blocks it for every role.
    can_cancel: canTransition(row.status, 'cancelled') && (row.status === 'draft' || Number(row.amount_paid) === 0),
    can_send: SENDABLE_STATUSES.includes(row.status),
  }
}

// ── reads ──

export async function list(pool: Pool, query: ListInvoicesQuery, now: Date = new Date()): Promise<ListInvoicesResult> {
  const page = query.page ?? 1
  const pageSize = query.page_size ?? 20
  const { page: _p, page_size: _s, sort, ...filters } = query
  const { rows, summary } = await repo.listInvoices(pool, filters, {
    ...(sort ? { sort } : {}),
    limit: pageSize,
    offset: (page - 1) * pageSize,
    today: todayInBusinessTimezone(now),
    grace: OVERDUE_GRACE_DAYS,
  })
  return { data: rows.map(toListItem), meta: { ...buildMeta(summary.count, page, pageSize), summary } }
}

export function get(pool: Pool, id: number, now: Date = new Date()): Promise<InvoiceDetailDto> {
  return loadDetail(pool, id, now)
}

// ── draft editing ──

export async function updateDraft(
  pool: Pool,
  id: number,
  input: UpdateDraftInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<InvoiceDetailDto> {
  return withTransaction(pool, async (tx) => {
    const before = await repo.findInvoice(tx, id, { forUpdate: true })
    if (!before) throw notFound()
    if (before.status !== 'draft') {
      throw new ApiError(409, INVOICE_ERROR_CODES.INVALID_STATE_TRANSITION, `Only draft invoices can be edited (this invoice is ${before.status})`)
    }
    if (input.due_date !== undefined && input.due_date < before.issue_date) {
      throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', [
        { field: 'due_date', message: 'Due date cannot be before the issue date' },
      ])
    }

    const removed: number[] = []
    if (input.remove_item_ids?.length) {
      const wanted = [...new Set(input.remove_item_ids)]
      const deleted = await repo.deleteDraftItems(tx, id, wanted)
      if (deleted.length !== wanted.length) {
        throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', [
          { field: 'remove_item_ids', message: 'One or more lines do not belong to this invoice' },
        ])
      }
      const remaining = await repo.listItems(tx, id)
      if (remaining.length === 0) {
        throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invalid input', [
          { field: 'remove_item_ids', message: 'An invoice must keep at least one line; cancel it instead' },
        ])
      }
      removed.push(...deleted)
      await repo.recomputeDraftTotals(tx, id)
    }

    const fields: { due_date?: string; notes?: string | null } = {}
    if (input.due_date !== undefined && input.due_date !== before.due_date) fields.due_date = input.due_date
    if (input.notes !== undefined && input.notes !== before.notes) fields.notes = input.notes
    if (Object.keys(fields).length && !(await repo.updateDraftFields(tx, id, fields))) {
      throw invalidTransition(before.status, before.status, 'the invoice is no longer a draft')
    }

    const changedOld: Record<string, unknown> = {}
    const changedNew: Record<string, unknown> = {}
    if (fields.due_date !== undefined) { changedOld.due_date = before.due_date; changedNew.due_date = fields.due_date }
    if (fields.notes !== undefined) { changedOld.notes = before.notes; changedNew.notes = fields.notes }
    if (removed.length) {
      changedOld.total = before.total
      changedNew.removed_item_ids = removed
    }
    if (Object.keys(changedNew).length) {
      await writeAudit(tx, {
        actorUserId: actor.id, action: INVOICE_AUDIT.update, entityType: INVOICE_ENTITY, entityId: id,
        oldValues: changedOld, newValues: changedNew, ipAddress: actor.ip,
      })
    }
    return loadDetail(tx, id, now)
  })
}

// ── confirm ──

/** Shared by confirm and bulkConfirm. Runs in the caller's transaction; throws ApiError to roll back. */
async function confirmInTx(tx: Queryable, id: number, actor: Actor): Promise<void> {
  const updated = await repo.confirmDraft(tx, id)
  if (!updated) {
    const row = await repo.findInvoice(tx, id)
    if (!row) throw notFound()
    throw invalidTransition(row.status, 'confirmed')
  }
  const check = await repo.checkConsistency(tx, id)
  if (check.lines < 1) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'An invoice needs at least one line before it can be confirmed')
  }
  if (!check.consistent) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Invoice totals do not match its lines')
  }
  await writeAudit(tx, {
    actorUserId: actor.id, action: INVOICE_AUDIT.confirm, entityType: INVOICE_ENTITY, entityId: id,
    oldValues: { status: 'draft' }, newValues: { status: 'confirmed' }, ipAddress: actor.ip,
  })
}

export async function confirm(pool: Pool, id: number, actor: Actor, now: Date = new Date()): Promise<InvoiceDetailDto> {
  return withTransaction(pool, async (tx) => {
    await confirmInTx(tx, id, actor)
    return loadDetail(tx, id, now)
  })
}

/** Each invoice is confirmed in its own transaction so one bad invoice never blocks the rest. */
export async function bulkConfirm(pool: Pool, input: BulkConfirmInput, actor: Actor): Promise<BulkConfirmResult> {
  let ids: number[]
  if (input.billing_run_id !== undefined) {
    if (!(await repo.billingRunExists(pool, input.billing_run_id))) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Billing run not found')
    }
    ids = await repo.draftIdsForRun(pool, input.billing_run_id)
  } else {
    ids = [...new Set(input.invoice_ids ?? [])]
  }

  const result: BulkConfirmResult = { confirmed: [], failed: [] }
  for (const id of ids) {
    try {
      await withTransaction(pool, (tx) => confirmInTx(tx, id, actor))
      result.confirmed.push(id)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      result.failed.push({ id, code: error.code })
    }
  }
  return result
}

// ── cancel ──

export async function cancel(
  pool: Pool,
  id: number,
  input: CancelInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<InvoiceDetailDto> {
  return withTransaction(pool, async (tx) => {
    const before = await repo.findInvoice(tx, id, { forUpdate: true })
    if (!before) throw notFound()
    // The conditional UPDATE is the real guard; the row lock above just serialises with confirm/payments.
    if (!(await repo.cancelIfAllowed(tx, id, input.reason))) {
      if (before.status === 'confirmed' && Number(before.amount_paid) > 0) {
        // Any allocated payment blocks cancellation for every role; the payment must be voided first.
        const who = actor.role === 'admin' ? 'Void the payment first' : 'Ask an Admin to void the payment first'
        throw invalidTransition(before.status, 'cancelled', `${who}, then cancel the invoice`)
      }
      throw invalidTransition(before.status, 'cancelled')
    }
    await invoiceHooks.releaseDiscountRedemption(tx, id)
    await writeAudit(tx, {
      actorUserId: actor.id, action: INVOICE_AUDIT.cancel, entityType: INVOICE_ENTITY, entityId: id,
      oldValues: { status: before.status }, newValues: { status: 'cancelled', cancel_reason: input.reason }, ipAddress: actor.ip,
    })
    return loadDetail(tx, id, now)
  })
}

// ── send ──

export async function send(
  pool: Pool,
  mailer: Mailer,
  id: number,
  input: SendInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<InvoiceDetailDto & { sent_to: string }> {
  const detail = await loadDetail(pool, id, now)
  if (!SENDABLE_STATUSES.includes(detail.status)) {
    throw new ApiError(409, INVOICE_ERROR_CODES.INVALID_STATE_TRANSITION, `A ${detail.status} invoice cannot be sent`)
  }
  // Recipient defaults to the email stored on the invoice (customer snapshot).
  const to = input.to ?? detail.customer.email
  const message: EmailMessage = {
    to,
    subject: `Invoice ${detail.number}`,
    text: renderInvoiceText(detail, input.message),
    html: renderInvoiceHtml(detail, input.message ? { message: input.message } : {}),
  }

  // Network call happens outside any DB transaction; nothing is written unless delivery succeeded.
  const delivery = await mailer.sendMail(message)
  if (!delivery.ok) {
    throw new ApiError(502, INVOICE_ERROR_CODES.EMAIL_FAILED, 'The invoice email could not be sent. The invoice was not changed.')
  }

  return withTransaction(pool, async (tx) => {
    const sentAt = await repo.markSent(tx, id)
    if (!sentAt) throw invalidTransition(detail.status, detail.status, 'the invoice changed while it was being sent')
    await writeAudit(tx, {
      actorUserId: actor.id, action: INVOICE_AUDIT.send, entityType: INVOICE_ENTITY, entityId: id,
      newValues: { sent_at: sentAt.toISOString(), to }, ipAddress: actor.ip,
    })
    return { ...(await loadDetail(tx, id, now)), sent_to: to }
  })
}

// ── print ──

export async function renderPrint(pool: Pool, id: number, now: Date = new Date()): Promise<string> {
  return renderInvoiceHtml(await loadDetail(pool, id, now))
}

// ── creation (called by F12 billing engine) ──

export async function createDraftInvoice(tx: Queryable, data: repo.InsertDraftInvoiceData): Promise<number> {
  return repo.insertDraftInvoice(tx, data)
}
