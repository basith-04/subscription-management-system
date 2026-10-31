// Invoice document renderer — ONE template used for the print endpoint and the email body.
// Every value that can contain user-controlled text goes through esc(); nothing is concatenated raw.
import type { InvoiceDetailDto } from './invoices.service.js'

const COMPANY_NAME = 'Brightloop'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape text for HTML text and attribute contexts. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]!)
}

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft', not_due: 'Not yet due', outstanding: 'Outstanding', partially_paid: 'Partially paid',
  overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled',
}

function addressLines(address: Record<string, unknown> | null): string[] {
  if (!address) return []
  const g = (k: string) => (typeof address[k] === 'string' ? (address[k] as string).trim() : '')
  const cityLine = [g('city'), g('state'), g('postal_code')].filter(Boolean).join(', ')
  return [g('line1'), g('line2'), cityLine, g('country')].filter(Boolean)
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef1f4; color: #172333; font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; padding: 16mm 14mm; background: #fff; }
  header.inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: .04em; }
  .muted { color: #5b6672; }
  .badge { display: inline-block; padding: 2px 10px; border: 1px solid #172333; border-radius: 12px; font-size: 12px; text-transform: uppercase; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; }
  .meta dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; }
  .meta dt { font-weight: 600; }
  .meta dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #d5dbe1; text-align: left; vertical-align: top; }
  th { background: #f3f5f7; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.desc { overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .totals { width: 80mm; margin: 14px 0 0 auto; break-inside: avoid; page-break-inside: avoid; }
  .totals td { border: 0; padding: 3px 8px; }
  .totals tr.grand td { border-top: 2px solid #172333; font-weight: 700; }
  .section-title { margin: 20px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; }
  .note { margin-top: 18px; padding: 8px 10px; border-left: 3px solid #8aa0b5; background: #f6f8fa; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
  .watermark { color: #a31f17; font-weight: 700; }
  @page { size: A4; margin: 10mm; }
  @media print {
    body { background: #fff; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; }
  }
`

export interface RenderOptions {
  /** Optional personal message shown above the invoice (email). Escaped. */
  message?: string
}

/** Full standalone HTML document for an invoice. */
export function renderInvoiceHtml(inv: InvoiceDetailDto, opts: RenderOptions = {}): string {
  const money = (v: string) => esc(v)
  const addr = addressLines(inv.customer.billing_address)
  const rows = inv.items
    .map(
      (it) => `<tr>
        <td class="desc">${esc(it.description)}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td class="num">${money(it.unit_price)}</td>
        <td class="num">${money(it.discount_amount)}</td>
        <td>${it.tax_name ? `${esc(it.tax_name)} (${esc(it.tax_rate)}%)` : '—'}</td>
        <td class="num">${money(it.line_total)}</td>
      </tr>`,
    )
    .join('')
  const taxRows = inv.tax_details
    .map(
      (t) => `<tr><td>${esc(t.tax_name)} (${esc(t.tax_rate)}%)</td><td class="num">${money(t.taxable_amount)}</td><td class="num">${money(t.tax_amount)}</td></tr>`,
    )
    .join('')
  const stateLabel = STATE_LABEL[inv.payment_state] ?? inv.payment_state

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${esc(inv.number)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet" data-invoice-number="${esc(inv.number)}">
  ${opts.message ? `<p class="note">${esc(opts.message)}</p>` : ''}
  <header class="inv-head">
    <div>
      <h1>INVOICE</h1>
      <div class="muted">${esc(inv.number)}</div>
    </div>
    <div style="text-align:right">
      <strong>${esc(COMPANY_NAME)}</strong><br>
      <span class="badge">${esc(stateLabel)}</span>
      ${inv.status === 'draft' ? '<div class="watermark">DRAFT — not yet issued</div>' : ''}
      ${inv.status === 'cancelled' ? '<div class="watermark">CANCELLED</div>' : ''}
    </div>
  </header>

  <section class="meta">
    <div>
      <div class="muted">Billed to</div>
      <strong>${esc(inv.customer.name)}</strong><br>
      ${esc(inv.customer.email)}<br>
      ${addr.map((l) => `${esc(l)}<br>`).join('')}
      ${inv.customer.tax_id ? `Tax ID: ${esc(inv.customer.tax_id)}` : ''}
    </div>
    <dl>
      <dt>Issue date</dt><dd>${esc(inv.issue_date)}</dd>
      <dt>Due date</dt><dd>${esc(inv.due_date)}</dd>
      <dt>Payment terms</dt><dd>${esc(inv.payment_term)}</dd>
      <dt>Billing period</dt><dd>${esc(inv.period_start)} to ${esc(inv.period_end)}</dd>
      ${inv.subscription.number ? `<dt>Subscription</dt><dd>${esc(inv.subscription.number)}</dd>` : ''}
    </dl>
  </section>

  <table aria-label="Invoice lines">
    <thead><tr>
      <th>Description</th><th class="num">Qty</th><th class="num">Unit price</th>
      <th class="num">Discount</th><th>Tax</th><th class="num">Line total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${taxRows ? `<h2 class="section-title">Tax summary</h2>
  <table aria-label="Tax summary"><thead><tr><th>Tax</th><th class="num">Taxable amount</th><th class="num">Tax</th></tr></thead><tbody>${taxRows}</tbody></table>` : ''}

  <table class="totals" aria-label="Totals"><tbody>
    <tr><td>Subtotal</td><td class="num">${money(inv.subtotal)}</td></tr>
    <tr><td>Discount</td><td class="num">−${money(inv.discount_total)}</td></tr>
    <tr><td>Tax</td><td class="num">${money(inv.tax_total)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${money(inv.total)}</td></tr>
    <tr><td>Amount paid</td><td class="num">${money(inv.amount_paid)}</td></tr>
    <tr class="grand"><td>Amount due</td><td class="num">${money(inv.amount_due)}</td></tr>
  </tbody></table>

  ${inv.notes ? `<p class="note">${esc(inv.notes)}</p>` : ''}
</main>
</body>
</html>`
}

/** Plain-text alternative for the email. */
export function renderInvoiceText(inv: InvoiceDetailDto, message?: string): string {
  const lines = [
    ...(message ? [message, ''] : []),
    `Invoice ${inv.number}`,
    `Billed to: ${inv.customer.name} <${inv.customer.email}>`,
    `Issue date: ${inv.issue_date}   Due date: ${inv.due_date}`,
    `Billing period: ${inv.period_start} to ${inv.period_end}`,
    '',
    ...inv.items.map((it) => `${it.description} × ${it.quantity} @ ${it.unit_price} = ${it.line_total}`),
    '',
    `Subtotal: ${inv.subtotal}`,
    `Discount: -${inv.discount_total}`,
    `Tax: ${inv.tax_total}`,
    `Total: ${inv.total}`,
    `Amount paid: ${inv.amount_paid}`,
    `Amount due: ${inv.amount_due}`,
  ]
  return lines.join('\n')
}
