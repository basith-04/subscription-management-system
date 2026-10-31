// Explicit, allow-listed response shapes for the portal. Nothing is spread from a database row or an internal DTO,
// so a new internal column can never leak by accident: only the fields named here are ever returned.
import { computeLine, computeTotals } from '../../billing/calculators/pricing.js'
import type { InvoiceDetailDto } from '../invoices/index.js'
import type { InvoiceListRow, ItemRow, PaymentRow, SubscriptionRow } from './portal.repository.js'

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export function displayStatus(row: Pick<SubscriptionRow, 'status' | 'paused_at' | 'quotation_valid_until'>, today: string): string {
  if (row.status === 'active' && row.paused_at) return 'Active (Paused)'
  if (row.status === 'quotation' && row.quotation_valid_until && row.quotation_valid_until < today) return 'Quotation (expired)'
  return row.status.charAt(0).toUpperCase() + row.status.slice(1)
}

export interface CustomerActions {
  can_confirm: boolean
  can_pause: boolean
  can_resume: boolean
  can_renew: boolean
  can_close: boolean
}

/**
 * What the customer may do right now, from state + plan policy (docs/architecture/state-machines.md §2.2–2.3).
 * `lifecycleEnabled` gates the F10 actions until their endpoints exist. The server re-checks every action anyway.
 */
export function customerActions(row: SubscriptionRow, today: string, lifecycleEnabled: boolean): CustomerActions {
  const active = row.status === 'active'
  const paused = row.paused_at !== null
  return {
    can_confirm: row.status === 'quotation' && row.quotation_valid_until !== null && row.quotation_valid_until >= today,
    can_pause: lifecycleEnabled && active && !paused && row.allow_pause,
    can_resume: lifecycleEnabled && active && paused,
    can_renew: lifecycleEnabled && active && row.allow_renewal && row.plan_is_active,
    can_close: lifecycleEnabled && active && row.allow_early_close,
  }
}

export function toSubscriptionListItem(row: SubscriptionRow, today: string, lifecycleEnabled: boolean) {
  return {
    id: Number(row.id), number: row.number, status: row.status, display_status: displayStatus(row, today),
    plan: { id: Number(row.plan_id), name: row.plan_name, billing_frequency: row.billing_frequency },
    start_date: row.start_date, expiry_date: row.expiry_date, days_to_expiry: daysBetween(today, row.expiry_date),
    quotation_valid_until: row.quotation_valid_until, next_billing_date: row.next_billing_date,
    ...customerActions(row, today, lifecycleEnabled),
  }
}

export function toSubscriptionDetail(row: SubscriptionRow, items: ItemRow[], today: string, lifecycleEnabled: boolean) {
  const lines = items.map((i) => {
    const l = computeLine({ quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate })
    return {
      description: i.description, quantity: i.quantity, unit_price: i.unit_price,
      tax: i.tax_name ? { name: i.tax_name, rate: i.tax_rate ?? '0.000' } : null,
      line_amount: l.line_amount, tax_amount: l.tax_amount, line_total: l.line_total,
    }
  })
  return {
    ...toSubscriptionListItem(row, today, lifecycleEnabled),
    payment_term: row.payment_term_name, paused: row.paused_at !== null, auto_renew: row.auto_renew,
    items: lines,
    totals: computeTotals(items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate }))),
  }
}

export function toInvoiceListItem(row: InvoiceListRow) {
  return {
    id: Number(row.id), number: row.number, status: row.status, payment_state: row.payment_state,
    issue_date: row.issue_date, due_date: row.due_date, total: row.total, amount_paid: row.amount_paid, amount_due: row.amount_due,
  }
}

export function toPayment(p: PaymentRow) {
  return { id: Number(p.id), method: p.method, payment_date: p.payment_date, amount: p.amount, reference_number: p.reference_number, is_voided: p.is_voided }
}

/** The customer's own invoice, without internal fields (billing run, sent_at, cancel reason, created_at, staff `can_*`). */
export function toInvoiceDetail(inv: InvoiceDetailDto, payments: PaymentRow[]) {
  return {
    id: inv.id, number: inv.number, status: inv.status, payment_state: inv.payment_state,
    subscription: { id: inv.subscription.id, number: inv.subscription.number },
    customer: { id: inv.customer.id, name: inv.customer.name, email: inv.customer.email, tax_id: inv.customer.tax_id, billing_address: inv.customer.billing_address },
    period_start: inv.period_start, period_end: inv.period_end, issue_date: inv.issue_date, due_date: inv.due_date,
    payment_term: inv.payment_term, notes: inv.notes,
    items: inv.items.map((i) => ({
      id: i.id, description: i.description, quantity: i.quantity, unit_price: i.unit_price, line_subtotal: i.line_subtotal,
      discount_amount: i.discount_amount, taxable_amount: i.taxable_amount, tax_name: i.tax_name, tax_rate: i.tax_rate,
      tax_amount: i.tax_amount, line_total: i.line_total,
    })),
    tax_details: inv.tax_details.map((t) => ({ tax_name: t.tax_name, tax_rate: t.tax_rate, taxable_amount: t.taxable_amount, tax_amount: t.tax_amount })),
    subtotal: inv.subtotal, discount_total: inv.discount_total, tax_total: inv.tax_total, total: inv.total,
    amount_paid: inv.amount_paid, amount_due: inv.amount_due,
    payments: payments.map(toPayment),
  }
}
