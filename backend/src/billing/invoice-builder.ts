import { add, sub, mulInt, fromMinor, toMinor } from '../lib/money.js'
import type { InsertDraftInvoiceData } from '../modules/invoices/invoices.repository.js'

export interface BuildInvoiceParams {
  subscription: { id: number; customer_id: number }
  customer: { name: string; email: string; tax_id: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null }
  payment_term: { name: string; due_days: number }
  items: Array<{ id: number; product_id: number | null; description: string; quantity: number; unit_price: string; tax_rule_id: number | null }>
  tax_rules: Record<number, { name: string; rate: string }>
  period_start: string
  period_end: string
  issue_date: string
  billing_run_id: number | null
}

/** ROUND_HALF_UP(taxable × rate / 100, 2) in exact integer arithmetic. */
function taxFor(taxable: string, rate: string): string {
  const rateMilli = BigInt(Math.round(Number(rate) * 1000))
  return fromMinor((toMinor(taxable) * rateMilli + 50_000n) / 100_000n)
}

export function buildDraftInvoice(params: BuildInvoiceParams): InsertDraftInvoiceData {
  const { subscription, customer, payment_term, items, tax_rules, period_start, period_end, issue_date, billing_run_id } = params

  // Due date is issue_date + term.due_days. (Simple JS date math for YYYY-MM-DD)
  const dueDateObj = new Date(`${issue_date}T00:00:00Z`)
  dueDateObj.setUTCDate(dueDateObj.getUTCDate() + payment_term.due_days)
  const due_date = dueDateObj.toISOString().slice(0, 10)

  let subtotal = '0.00'
  let discount_total = '0.00'
  let tax_total = '0.00'

  const insertedItems = items.map((item) => {
    const line_subtotal = mulInt(item.unit_price, item.quantity)
    const discount_amount = '0.00' // F15 will supply this later
    const taxable_amount = sub(line_subtotal, discount_amount)
    
    const rule = item.tax_rule_id ? tax_rules[item.tax_rule_id] : null
    const tax_name = rule ? rule.name : null
    const tax_rate = rule ? rule.rate : '0.000'
    const tax_amount = taxFor(taxable_amount, tax_rate)
    
    const line_total = add(taxable_amount, tax_amount)

    subtotal = add(subtotal, line_subtotal)
    discount_total = add(discount_total, discount_amount)
    tax_total = add(tax_total, tax_amount)

    return {
      subscription_item_id: item.id,
      product_id: item.product_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_subtotal,
      discount_amount,
      taxable_amount,
      tax_name,
      tax_rate,
      tax_amount,
      line_total
    }
  })

  const total = add(sub(subtotal, discount_total), tax_total)

  // Aggregate tax details
  const taxMap = new Map<string, { tax_name: string; tax_rate: string; taxable_amount: string; tax_amount: string }>()
  for (const item of insertedItems) {
    if (!item.tax_name) continue
    const key = `${item.tax_name}|${item.tax_rate}`
    const existing = taxMap.get(key)
    if (existing) {
      existing.taxable_amount = add(existing.taxable_amount, item.taxable_amount)
      existing.tax_amount = add(existing.tax_amount, item.tax_amount)
    } else {
      taxMap.set(key, {
        tax_name: item.tax_name,
        tax_rate: item.tax_rate,
        taxable_amount: item.taxable_amount,
        tax_amount: item.tax_amount
      })
    }
  }

  const billing_address = {
    line1: customer.address_line1,
    line2: customer.address_line2,
    city: customer.city,
    state: customer.state,
    postal_code: customer.postal_code,
    country: customer.country
  }

  return {
    subscription_id: subscription.id,
    customer_id: subscription.customer_id,
    billing_run_id,
    period_start,
    period_end,
    issue_date,
    due_date,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_tax_id: customer.tax_id,
    billing_address,
    payment_term_name: payment_term.name,
    subtotal,
    discount_total,
    tax_total,
    total,
    items: insertedItems,
    tax_details: Array.from(taxMap.values())
  }
}
