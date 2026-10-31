// Statuses and enums for payments (values match DB CHECK constraints).
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_SORT_FIELDS = ['payment_date', 'amount'] as const
export const MAX_ALLOCATIONS = 50

/** Window for the "same payment submitted twice" heuristic (feature-breakdown F13 §D). */
export const DUPLICATE_WINDOW_SECONDS = 60

/** Codes from docs/api/api-specification.md §1.2 / §12, kept here so the shared error-codes file is untouched. */
export const PAYMENT_ERROR_CODES = {
  DUPLICATE_PAYMENT_REFERENCE: 'DUPLICATE_PAYMENT_REFERENCE',
  /** Same customer/invoice/amount/date/method within 60 s; resend with confirm_duplicate: true to override. */
  POSSIBLE_DUPLICATE_PAYMENT: 'POSSIBLE_DUPLICATE_PAYMENT',
  ALLOCATION_EXCEEDS_AMOUNT_DUE: 'ALLOCATION_EXCEEDS_AMOUNT_DUE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
} as const

export const PAYMENT_AUDIT = {
  record: 'payment.record',
  void: 'payment.void',
  invoicePaid: 'invoice.paid',
  invoiceReopened: 'invoice.reopen',
} as const
export const PAYMENT_ENTITY = 'payment'
