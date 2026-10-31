// Zod request schemas for invoices (body, params, query).
import { z } from 'zod'
import { normalizeEmail } from '../../lib/text.js'
import { toMinor } from '../../lib/money.js'
import {
  BULK_CONFIRM_MAX,
  INVOICE_SORT_FIELDS,
  INVOICE_STATUSES,
  PAYMENT_STATES,
} from './invoices.constants.js'

const hasControlChars = (v: string, allowNewlines = false) =>
  [...v].some((c) => {
    const code = c.charCodeAt(0)
    if (allowNewlines && (code === 10 || code === 13 || code === 9)) return false
    return code < 32 || code === 127
  })

const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, 'Not a valid calendar date')
const moneyString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a non-negative amount such as 1500.00')

export const invoiceIdParams = z.object({ id }).strict()

const stateList = z
  .string()
  .refine(
    (s) => s.split(',').every((v) => (PAYMENT_STATES as readonly string[]).includes(v)),
    `payment_state must be one or more of: ${PAYMENT_STATES.join(', ')} (comma separated)`,
  )
  .transform((s) => [...new Set(s.split(',')) ] as (typeof PAYMENT_STATES)[number][])

export const listInvoicesQuery = z
  .object({
    status: z.enum(INVOICE_STATUSES).optional(),
    payment_state: stateList.optional(),
    customer_id: id.optional(),
    subscription_id: id.optional(),
    issue_from: isoDate.optional(),
    issue_to: isoDate.optional(),
    due_from: isoDate.optional(),
    due_to: isoDate.optional(),
    q: z.string().trim().max(120).optional(),
    min_total: moneyString.optional(),
    max_total: moneyString.optional(),
    sort: z
      .string()
      .refine(
        (s) => s.split(',').every((f) => (INVOICE_SORT_FIELDS as readonly string[]).includes(f.replace(/^-/, ''))),
        `sort must be a comma list of: ${INVOICE_SORT_FIELDS.join(', ')} (prefix - for descending)`,
      )
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const pairs: Array<[keyof typeof q, keyof typeof q]> = [['issue_from', 'issue_to'], ['due_from', 'due_to']]
    for (const [from, to] of pairs) {
      const a = q[from] as string | undefined
      const b = q[to] as string | undefined
      if (a && b && a > b) ctx.addIssue({ code: 'custom', path: [to], message: `${String(to)} must not be before ${String(from)}` })
    }
    if (q.min_total && q.max_total && toMinor(q.min_total) > toMinor(q.max_total)) {
      ctx.addIssue({ code: 'custom', path: ['max_total'], message: 'max_total must not be below min_total' })
    }
  })

/** Draft-only editable fields: due date, notes, and removing lines (docs/api §11 PATCH). */
export const updateDraftBody = z
  .object({
    due_date: isoDate.optional(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Notes must be at most 2000 characters long')
      .refine((v) => !hasControlChars(v, true), 'Notes contain invalid characters')
      .nullable()
      .transform((v) => (v === null || v === '' ? null : v))
      .optional(),
    remove_item_ids: z.array(id).max(200).optional(),
  })
  .strict()
  .refine((b) => b.due_date !== undefined || b.notes !== undefined || (b.remove_item_ids?.length ?? 0) > 0, {
    message: 'Provide at least one field to change',
  })

export const cancelBody = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'A cancellation reason is required')
      .max(500, 'Reason must be at most 500 characters long')
      .refine((v) => !hasControlChars(v, true), 'Reason contains invalid characters'),
  })
  .strict()

export const bulkConfirmBody = z
  .object({
    invoice_ids: z
      .array(id)
      .min(1, 'Provide at least one invoice id')
      .max(BULK_CONFIRM_MAX, `At most ${BULK_CONFIRM_MAX} invoices can be confirmed at once`)
      .optional(),
    billing_run_id: id.optional(),
  })
  .strict()
  .refine((b) => (b.invoice_ids !== undefined) !== (b.billing_run_id !== undefined), {
    message: 'Provide exactly one of invoice_ids or billing_run_id',
  })

export const sendBody = z
  .object({
    to: z
      .string()
      .trim()
      .max(254)
      .email('Enter a valid email address')
      .refine((v) => !hasControlChars(v), 'Enter a valid email address')
      .transform(normalizeEmail)
      .optional(),
    message: z
      .string()
      .trim()
      .max(1000, 'Message must be at most 1000 characters long')
      .refine((v) => !hasControlChars(v, true), 'Message contains invalid characters')
      .optional(),
  })
  .strict()

export const printQuery = z
  .object({ format: z.enum(['html']).optional() })
  .strict()

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>
export type UpdateDraftInput = z.infer<typeof updateDraftBody>
export type CancelInput = z.infer<typeof cancelBody>
export type BulkConfirmInput = z.infer<typeof bulkConfirmBody>
export type SendInput = z.infer<typeof sendBody>
