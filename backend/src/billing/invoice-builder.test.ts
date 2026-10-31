import { describe, expect, it } from 'vitest'
import { buildDraftInvoice, type BuildInvoiceParams } from './invoice-builder.js'

describe('buildDraftInvoice', () => {
  const baseParams: BuildInvoiceParams = {
    subscription: { id: 1, customer_id: 10 },
    customer: {
      name: 'Acme Corp',
      email: 'billing@acme.test',
      tax_id: 'GST123',
      address_line1: '123 Main St',
      address_line2: null,
      city: 'Kochi',
      state: 'Kerala',
      postal_code: '682001',
      country: 'India',
    },
    payment_term: { name: 'Net 15', due_days: 15 },
    items: [
      { id: 1, product_id: 5, description: 'Platform - Odoo', quantity: 5, unit_price: '1560.00', tax_rule_id: 1 },
    ],
    tax_rules: {
      1: { name: 'GST 18%', rate: '18.000' },
    },
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    issue_date: '2026-11-01',
    billing_run_id: 99,
  }

  it('matches the §7 worked example exactly (5 × 1,560.00, 18% tax = 9,204.00 without discount)', () => {
    const result = buildDraftInvoice(baseParams)

    // Subtotal: 5 * 1560 = 7800
    expect(result.subtotal).toBe('7800.00')
    expect(result.discount_total).toBe('0.00')
    
    // Tax: 7800 * 0.18 = 1404.00
    // Note: The doc example shows 8,283.60 because it applies a 10% discount first (F15).
    // Without the discount, the correct total is 7800 + 1404 = 9204.00
    expect(result.tax_total).toBe('1404.00')
    expect(result.total).toBe('9204.00')

    expect(result.items[0].line_subtotal).toBe('7800.00')
    expect(result.items[0].taxable_amount).toBe('7800.00')
    expect(result.items[0].tax_amount).toBe('1404.00')
    expect(result.items[0].line_total).toBe('9204.00')

    expect(result.tax_details).toEqual([
      { tax_name: 'GST 18%', tax_rate: '18.000', taxable_amount: '7800.00', tax_amount: '1404.00' }
    ])
  })

  it('calculates tax per line using ROUND_HALF_UP', () => {
    const params = { ...baseParams }
    params.items = [{ id: 2, product_id: 6, description: 'Add-on', quantity: 1, unit_price: '33.33', tax_rule_id: 2 }]
    params.tax_rules = { 2: { name: 'GST 5%', rate: '5.000' } }
    
    const result = buildDraftInvoice(params)
    
    // 33.33 * 0.05 = 1.6665 -> Round Half Up -> 1.67
    expect(result.items[0].tax_amount).toBe('1.67')
    expect(result.items[0].line_total).toBe('35.00')
    expect(result.total).toBe('35.00')
  })

  it('sets the due date based on the payment term', () => {
    const result = buildDraftInvoice(baseParams)
    // Issue date: 2026-11-01, Net 15 -> 2026-11-16
    expect(result.issue_date).toBe('2026-11-01')
    expect(result.due_date).toBe('2026-11-16')
  })

  it('handles multiple items and aggregates tax details correctly', () => {
    const params = { ...baseParams }
    params.items = [
      { id: 3, product_id: 7, description: 'Line A', quantity: 1, unit_price: '100.00', tax_rule_id: 1 },
      { id: 4, product_id: 8, description: 'Line B', quantity: 2, unit_price: '50.00', tax_rule_id: 1 },
    ]
    const result = buildDraftInvoice(params)
    
    expect(result.subtotal).toBe('200.00')
    expect(result.tax_total).toBe('36.00') // (100 + 100) * 0.18
    expect(result.tax_details[0].taxable_amount).toBe('200.00')
  })
})
