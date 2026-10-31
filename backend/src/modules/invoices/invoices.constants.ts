// Statuses and enums for invoices (values match DB CHECK constraints).

export const INVOICE_STATUSES = ['draft', 'confirmed', 'paid', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** Derived, never stored. See invoices.payment-state.ts (the single implementation). */
export const PAYMENT_STATES = [
  'draft',
  'not_due',
  'outstanding',
  'partially_paid',
  'overdue',
  'paid',
  'cancelled',
] as const
export type PaymentState = (typeof PAYMENT_STATES)[number]

export const INVOICE_SORT_FIELDS = ['issue_date', 'due_date', 'total', 'number'] as const
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number]

/** D-13: overdue grace days. Default 0 (overdue the day after the due date). */
export const OVERDUE_GRACE_DAYS = 0

/** Business timezone fallback (D-22). Matches the default F09 adds to config as `appTimezone`. */
export const DEFAULT_APP_TIMEZONE = 'Asia/Kolkata'

export const BULK_CONFIRM_MAX = 500

/**
 * Error codes specific to F11. `INVALID_STATE_TRANSITION` (409) and `EMAIL_FAILED` (502) are defined in
 * docs/api/api-specification.md §1.2 / §11; they are kept here so the shared error-codes file is untouched.
 */
export const INVOICE_ERROR_CODES = {
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  EMAIL_FAILED: 'EMAIL_FAILED',
} as const

export const INVOICE_AUDIT = {
  update: 'invoice.update',
  confirm: 'invoice.confirm',
  cancel: 'invoice.cancel',
  send: 'invoice.send',
} as const

export const INVOICE_ENTITY = 'invoice'
