// Constants for the customer portal (F14). Read-only module: no tables of its own.

/** D-17 visibility: customers never see drafts (quotations in draft, invoices in draft). */
export const VISIBLE_SUBSCRIPTION_STATUSES = ['quotation', 'confirmed', 'active', 'closed'] as const
export const VISIBLE_INVOICE_STATUSES = ['confirmed', 'paid', 'cancelled'] as const

/**
 * Subscription lifecycle actions (pause / resume / renew / close) belong to F10, whose endpoints are not on main yet.
 * Until they ship, the portal reports those `can_*` flags as false so the UI never offers a button that has no endpoint.
 * Flip to true when F10 merges; the policy rules in portal.mappers.ts (state-machines.md §2.3) then apply.
 */
export const LIFECYCLE_ACTIONS_ENABLED = false

export const PORTAL_SUBSCRIPTION_SORT = ['number', 'start_date', 'expiry_date', 'next_billing_date', 'created_at'] as const
export const PORTAL_INVOICE_SORT = ['issue_date', 'due_date', 'total', 'number'] as const
