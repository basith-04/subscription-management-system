// Zod request schemas for the portal. Note: there is deliberately NO customer_id anywhere — the customer
// always comes from the authenticated session (scopeToCustomer).
import { z } from 'zod'
import { PAYMENT_STATES } from '../invoices/index.js'
import { PORTAL_INVOICE_SORT, PORTAL_SUBSCRIPTION_SORT, VISIBLE_INVOICE_STATUSES, VISIBLE_SUBSCRIPTION_STATUSES } from './portal.constants.js'

const page = z.coerce.number().int().min(1).max(100_000).optional()
const pageSize = z.coerce.number().int().min(1).max(100).optional()
const sort = (allowed: readonly string[]) => z.string().refine(
  (s) => s.split(',').every((f) => allowed.includes(f.replace(/^-/, ''))), `sort must be a comma list of: ${allowed.join(', ')}`).optional()

export const idParams = z.object({ id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()

export const listMySubscriptionsQuery = z.object({
  status: z.enum(VISIBLE_SUBSCRIPTION_STATUSES).optional(),
  page, page_size: pageSize, sort: sort(PORTAL_SUBSCRIPTION_SORT),
}).strict()

export const listMyInvoicesQuery = z.object({
  status: z.enum(VISIBLE_INVOICE_STATUSES).optional(),
  payment_state: z.string().refine(
    (s) => s.split(',').every((v) => v !== 'draft' && (PAYMENT_STATES as readonly string[]).includes(v)),
    'payment_state must be one or more of: not_due, outstanding, partially_paid, overdue, paid, cancelled',
  ).transform((s) => [...new Set(s.split(','))]).optional(),
  page, page_size: pageSize, sort: sort(PORTAL_INVOICE_SORT),
}).strict()

export type ListMySubscriptionsQuery = z.infer<typeof listMySubscriptionsQuery>
export type ListMyInvoicesQuery = z.infer<typeof listMyInvoicesQuery>
