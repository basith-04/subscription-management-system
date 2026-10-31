// Allowed invoice transitions and guards (docs/architecture/state-machines.md §3.3).
// The shared lib/state-machine.ts helper is still a placeholder on main; this module keeps its own
// table and does the conditional UPDATE in the repository (`UPDATE … WHERE id=$1 AND status=$expected`).
import { ApiError } from '../../lib/errors.js'
import { INVOICE_ERROR_CODES, type InvoiceStatus } from './invoices.constants.js'

/** Who may trigger a transition. `payments` transitions are reserved for the F13 payment service. */
export type TransitionActor = 'invoices' | 'payments'

interface Transition {
  from: InvoiceStatus
  to: InvoiceStatus
  actor: TransitionActor
}

export const INVOICE_TRANSITIONS: readonly Transition[] = [
  { from: 'draft', to: 'confirmed', actor: 'invoices' },
  { from: 'draft', to: 'cancelled', actor: 'invoices' },
  // Only when no payment is allocated; enforced by the conditional UPDATE (amount_paid = 0).
  { from: 'confirmed', to: 'cancelled', actor: 'invoices' },
  // Automatic when allocations make amount_due = 0. Never exposed as an endpoint.
  { from: 'confirmed', to: 'paid', actor: 'payments' },
  // Payment void (Admin).
  { from: 'paid', to: 'confirmed', actor: 'payments' },
]

export function canTransition(from: InvoiceStatus, to: InvoiceStatus, actor: TransitionActor = 'invoices'): boolean {
  return INVOICE_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor)
}

export function invalidTransition(from: InvoiceStatus, to: InvoiceStatus, hint?: string): ApiError {
  return new ApiError(
    409,
    INVOICE_ERROR_CODES.INVALID_STATE_TRANSITION,
    `Cannot move an invoice from ${from} to ${to}${hint ? `: ${hint}` : ''}`,
  )
}

/** Throws 409 INVALID_STATE_TRANSITION for any pair not in the table. */
export function assertTransition(from: InvoiceStatus, to: InvoiceStatus, actor: TransitionActor = 'invoices'): void {
  if (!canTransition(from, to, actor)) throw invalidTransition(from, to)
}

/** Statuses an invoice may be emailed from (send is an action, not a state). */
export const SENDABLE_STATUSES: readonly InvoiceStatus[] = ['confirmed', 'paid']
