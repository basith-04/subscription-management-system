import { describe, expect, it } from 'vitest'
import { esc, renderInvoiceHtml } from '../../../src/modules/invoices/invoices.document.js'
import type { InvoiceDetailDto } from '../../../src/modules/invoices/invoices.service.js'
import {
  bulkConfirmBody, cancelBody, listInvoicesQuery, sendBody, updateDraftBody,
} from '../../../src/modules/invoices/invoices.schemas.js'

describe('invoice request schemas', () => {
  it('bulk-confirm needs exactly one selector and at most 500 ids', () => {
    expect(bulkConfirmBody.safeParse({ invoice_ids: [1, 2] }).success).toBe(true)
    expect(bulkConfirmBody.safeParse({ billing_run_id: 3 }).success).toBe(true)
    expect(bulkConfirmBody.safeParse({}).success).toBe(false)
    expect(bulkConfirmBody.safeParse({ invoice_ids: [1], billing_run_id: 2 }).success).toBe(false)
    expect(bulkConfirmBody.safeParse({ invoice_ids: Array.from({ length: 500 }, (_, i) => i + 1) }).success).toBe(true)
    expect(bulkConfirmBody.safeParse({ invoice_ids: Array.from({ length: 501 }, (_, i) => i + 1) }).success).toBe(false)
    expect(bulkConfirmBody.safeParse({ invoice_ids: [] }).success).toBe(false)
  })

  it('cancel requires a non-blank reason', () => {
    expect(cancelBody.safeParse({ reason: 'Duplicate' }).success).toBe(true)
    expect(cancelBody.safeParse({ reason: '   ' }).success).toBe(false)
    expect(cancelBody.safeParse({}).success).toBe(false)
  })

  it('send validates and normalises the recipient and rejects unknown fields', () => {
    expect(sendBody.parse({ to: ' Person@Example.COM ' }).to).toBe('person@example.com')
    expect(sendBody.safeParse({ to: 'not-an-email' }).success).toBe(false)
    expect(sendBody.safeParse({ to: 'a@b.co', bcc: 'x@y.z' }).success).toBe(false)
    expect(sendBody.safeParse({ message: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('draft update accepts only the documented fields and needs at least one', () => {
    expect(updateDraftBody.safeParse({}).success).toBe(false)
    expect(updateDraftBody.safeParse({ due_date: '2026-12-31' }).success).toBe(true)
    expect(updateDraftBody.safeParse({ due_date: '2026-02-30' }).success).toBe(false)
    expect(updateDraftBody.safeParse({ total: '1.00' }).success).toBe(false)
    expect(updateDraftBody.safeParse({ status: 'paid' }).success).toBe(false)
  })

  it('list query rejects unknown filters/sort and parses payment_state lists', () => {
    expect(listInvoicesQuery.safeParse({ bogus: '1' }).success).toBe(false)
    expect(listInvoicesQuery.safeParse({ sort: 'amount_due' }).success).toBe(false)
    expect(listInvoicesQuery.safeParse({ sort: '-due_date,number' }).success).toBe(true)
    expect(listInvoicesQuery.parse({ payment_state: 'overdue,partially_paid' }).payment_state).toEqual(['overdue', 'partially_paid'])
    expect(listInvoicesQuery.safeParse({ payment_state: 'late' }).success).toBe(false)
    expect(listInvoicesQuery.safeParse({ issue_from: '2026-02-01', issue_to: '2026-01-01' }).success).toBe(false)
    expect(listInvoicesQuery.safeParse({ min_total: '10.00', max_total: '5.00' }).success).toBe(false)
  })
})

const detail = (over: Partial<InvoiceDetailDto> = {}): InvoiceDetailDto => ({
  id: 1, number: 'INV-000001', status: 'confirmed', payment_state: 'outstanding',
  subscription: { id: 5, number: 'SUB-000005' }, billing_run_id: null,
  customer: { id: 9, name: 'Acme <b>Traders</b>', email: 'acct@acme.test', tax_id: 'GST"1', billing_address: { line1: '1 <script>alert(1)</script> St', city: 'Kochi' } },
  period_start: '2026-11-01', period_end: '2026-11-30', issue_date: '2026-11-01', due_date: '2026-11-16', payment_term: 'Net 15',
  notes: '<img src=x onerror=alert(1)>',
  items: [{ id: 1, description: '"><script>x()</script>', quantity: 2, unit_price: '100.00', line_subtotal: '200.00', discount_amount: '0.00', taxable_amount: '200.00', tax_name: 'GST<18>', tax_rate: '18.000', tax_amount: '36.00', line_total: '236.00' }],
  tax_details: [{ tax_name: 'GST<18>', tax_rate: '18.000', taxable_amount: '200.00', tax_amount: '36.00' }],
  subtotal: '200.00', discount_total: '0.00', tax_total: '36.00', total: '236.00', amount_paid: '0.00', amount_due: '236.00',
  confirmed_at: null, paid_at: null, cancelled_at: null, cancel_reason: null, sent_at: null, created_at: '2026-11-01T00:00:00.000Z',
  can_edit: false, can_confirm: false, can_cancel: true, can_send: true, ...over,
})

describe('invoice HTML document', () => {
  it('esc handles all five dangerous characters', () => {
    expect(esc(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;')
  })

  it('escapes every user-controlled field (customer, address, tax id, lines, tax names, notes, message)', () => {
    const html = renderInvoiceHtml(detail(), { message: '<script>steal()</script>' })
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Traders</b>')
    expect(html).toContain('Acme &lt;b&gt;Traders&lt;/b&gt;')
    expect(html).toContain('GST&quot;1')
    expect(html).toContain('GST&lt;18&gt;')
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
  })

  it('renders snapshot values and totals, and print-friendly CSS', () => {
    const html = renderInvoiceHtml(detail())
    expect(html).toContain('INV-000001')
    expect(html).toContain('236.00')
    expect(html).toContain('@page')
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('thead { display: table-header-group; }')
  })

  it('marks drafts and cancelled invoices', () => {
    expect(renderInvoiceHtml(detail({ status: 'draft', payment_state: 'draft' }))).toContain('DRAFT')
    expect(renderInvoiceHtml(detail({ status: 'cancelled', payment_state: 'cancelled' }))).toContain('CANCELLED')
  })
})
