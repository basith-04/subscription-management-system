// Business rules for the customer portal. Read-only; every call receives the session's customerId.
import type { Pool } from 'pg'
import { todayInAppTimezone } from '../../lib/dates.js'
import { ApiError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import { buildMeta } from '../../lib/pagination.js'
import { getInvoice, renderInvoiceHtml, OVERDUE_GRACE_DAYS } from '../invoices/index.js'
import { getBalanceTotals } from '../payments/index.js'
import { LIFECYCLE_ACTIONS_ENABLED } from './portal.constants.js'
import { toInvoiceDetail, toInvoiceListItem, toSubscriptionDetail, toSubscriptionListItem } from './portal.mappers.js'
import * as repo from './portal.repository.js'
import type { ListMyInvoicesQuery, ListMySubscriptionsQuery } from './portal.schemas.js'

/** Same response for "does not exist" and "belongs to someone else": existence is never revealed. */
const notFound = (what: string) => new ApiError(404, ERROR_CODES.NOT_FOUND, `${what} not found`)

export async function listSubscriptions(pool: Pool, customerId: number, q: ListMySubscriptionsQuery, now: Date = new Date()) {
  const page = q.page ?? 1, size = q.page_size ?? 20, today = todayInAppTimezone(now)
  const { rows, total } = await repo.listSubscriptions(pool, customerId, { ...(q.status ? { status: q.status } : {}), ...(q.sort ? { sort: q.sort } : {}), limit: size, offset: (page - 1) * size })
  return { data: rows.map((r) => toSubscriptionListItem(r, today, LIFECYCLE_ACTIONS_ENABLED)), meta: buildMeta(total, page, size) }
}

export async function getSubscription(pool: Pool, customerId: number, id: number, now: Date = new Date()) {
  const row = await repo.findSubscription(pool, customerId, id)
  if (!row) throw notFound('Subscription')
  return toSubscriptionDetail(row, await repo.listSubscriptionItems(pool, customerId, id), todayInAppTimezone(now), LIFECYCLE_ACTIONS_ENABLED)
}

export async function listInvoices(pool: Pool, customerId: number, q: ListMyInvoicesQuery, now: Date = new Date()) {
  const page = q.page ?? 1, size = q.page_size ?? 20
  const { rows, total } = await repo.listInvoices(pool, customerId, {
    ...(q.status ? { status: q.status } : {}), ...(q.payment_state ? { payment_state: q.payment_state } : {}), ...(q.sort ? { sort: q.sort } : {}),
    limit: size, offset: (page - 1) * size, today: todayInAppTimezone(now), grace: OVERDUE_GRACE_DAYS,
  })
  // Backend-calculated totals owed (confirmed, unpaid). Cancelled and draft invoices never count; voided payments never reduce them.
  const balances = await getBalanceTotals(pool, { customerId }, now)
  return {
    data: rows.map(toInvoiceListItem),
    meta: { ...buildMeta(total, page, size), summary: { outstanding_amount: balances?.outstanding_amount ?? '0.00', overdue_amount: balances?.overdue_amount ?? '0.00' } },
  }
}

/** Loads the invoice through the shared F11 loader, but only after the customer-scoped ownership gate passes. */
async function loadOwnedInvoice(pool: Pool, customerId: number, id: number, now: Date) {
  if (!(await repo.ownsVisibleInvoice(pool, customerId, id))) throw notFound('Invoice')
  const invoice = await getInvoice(pool, id, now)
  // Defence in depth: never serve a record whose snapshot belongs to someone else, even if the gate were bypassed.
  if (invoice.customer.id !== customerId || invoice.status === 'draft') throw notFound('Invoice')
  return invoice
}

export async function getMyInvoice(pool: Pool, customerId: number, id: number, now: Date = new Date()) {
  const invoice = await loadOwnedInvoice(pool, customerId, id, now)
  return toInvoiceDetail(invoice, await repo.listInvoicePayments(pool, customerId, id))
}

/** Print uses the F11 document template (same HTML as staff print and the invoice email). */
export async function renderMyInvoicePrint(pool: Pool, customerId: number, id: number, now: Date = new Date()): Promise<string> {
  return renderInvoiceHtml(await loadOwnedInvoice(pool, customerId, id, now))
}
