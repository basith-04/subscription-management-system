// Zod request schemas for payments (body, params, query).
import { z } from 'zod'
import { compare } from '../../lib/money.js'
import { MAX_ALLOCATIONS, PAYMENT_METHODS, PAYMENT_SORT_FIELDS } from './payments.constants.js'

const hasControlChars = (v: string, allowNewlines = false) =>
  [...v].some((c) => { const n = c.charCodeAt(0); return (allowNewlines && (n === 9 || n === 10 || n === 13)) ? false : n < 32 || n === 127 })

const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'Not a valid calendar date')
/** Positive amount, at most 2 decimals, as a string (never a JSON number). */
const MONEY_SHAPE = /^\d{1,10}(\.\d{1,2})?$/
const positiveMoney = z.string().trim()
  .regex(MONEY_SHAPE, 'Use an amount with at most 2 decimals, e.g. 5283.60')
  .refine((v) => !MONEY_SHAPE.test(v) || compare(v, '0.00') > 0, 'Amount must be greater than zero')

export const paymentIdParams = z.object({ id }).strict()

export const recordPaymentBody = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: positiveMoney,
  payment_date: isoDate,
  note: z.string().trim().max(1000, 'Note must be at most 1000 characters')
    .refine((v) => !hasControlChars(v, true), 'Note contains invalid characters').nullable().optional()
    .transform((v) => (v ? v : null)),
  reference_number: z.string().trim().max(100, 'Reference must be at most 100 characters')
    .refine((v) => !hasControlChars(v), 'Reference contains invalid characters').nullable().optional()
    .transform((v) => (v ? v : null)),
  allocations: z.array(z.object({ invoice_id: id, amount: positiveMoney }).strict())
    .min(1, 'Allocate the payment to at least one invoice').max(MAX_ALLOCATIONS),
  confirm_duplicate: z.boolean().optional(),
}).strict()

export const voidPaymentBody = z.object({
  reason: z.string().trim().min(1, 'A void reason is required').max(500, 'Reason must be at most 500 characters')
    .refine((v) => !hasControlChars(v, true), 'Reason contains invalid characters'),
}).strict()

export const listPaymentsQuery = z.object({
  method: z.enum(PAYMENT_METHODS).optional(),
  customer_id: id.optional(),
  invoice_id: id.optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  voided: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.string().refine(
    (s) => s.split(',').every((f) => (PAYMENT_SORT_FIELDS as readonly string[]).includes(f.replace(/^-/, ''))),
    `sort must be a comma list of: ${PAYMENT_SORT_FIELDS.join(', ')} (prefix - for descending)`).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
}).strict().refine((q) => !(q.date_from && q.date_to) || q.date_from <= q.date_to, { message: 'date_to must not be before date_from', path: ['date_to'] })

export type RecordPaymentInput = z.infer<typeof recordPaymentBody>
export type VoidPaymentInput = z.infer<typeof voidPaymentBody>
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>
