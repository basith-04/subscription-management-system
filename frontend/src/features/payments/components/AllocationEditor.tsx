import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listInvoices } from '../../../api/invoices'
import { summarizeAllocations, type AllocationRowState } from '../allocation'

export interface AllocationEditorProps {
  customerId: number
  paymentAmount: string
  rows: AllocationRowState[]
  onChange: (rows: AllocationRowState[]) => void
  /** Invoice that opened the dialog; always allocated, never removable. */
  lockedInvoiceId: number
  disabled?: boolean
  /** Server-side per-row errors keyed by invoice id. */
  serverErrors?: Record<number, string>
}

const OPEN_STATES = 'not_due,outstanding,partially_paid,overdue'

/**
 * Splits one payment across several confirmed invoices of ONE customer. Only that customer's open invoices are
 * offered, so a mixed-customer allocation cannot be built from the UI (the server still rejects it).
 */
export function AllocationEditor({ customerId, paymentAmount, rows, onChange, lockedInvoiceId, disabled, serverErrors = {} }: AllocationEditorProps) {
  const [adding, setAdding] = useState(false)
  const open = useQuery({
    queryKey: ['invoices', 'open-for-customer', customerId],
    queryFn: () => listInvoices({ customer_id: customerId, payment_state: OPEN_STATES, page_size: 100, sort: 'due_date' }),
    enabled: adding, retry: false, staleTime: 10_000,
  })
  const summary = summarizeAllocations(paymentAmount, rows)
  const used = new Set(rows.map((r) => r.invoice_id))
  const candidates = (open.data?.data ?? []).filter((i) => !used.has(i.id) && i.status === 'confirmed')

  const setAmount = (invoiceId: number, amount: string) => onChange(rows.map((r) => (r.invoice_id === invoiceId ? { ...r, amount } : r)))

  return (
    <fieldset className="alloc-editor" disabled={disabled}>
      <legend>Allocation</legend>
      <table>
        <thead><tr><th>Invoice</th><th className="num">Remaining</th><th>Allocate</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const err = serverErrors[r.invoice_id] ?? summary.rowErrors[r.invoice_id]
            return (
              <tr key={r.invoice_id}>
                <td>{r.invoice_number}</td>
                <td className="num">{r.amount_due}</td>
                <td>
                  <input aria-label={`Allocate to ${r.invoice_number}`} inputMode="decimal" value={r.amount} aria-invalid={Boolean(err)}
                    onChange={(e) => setAmount(r.invoice_id, e.target.value)} />
                  {err && <p role="alert" className="field-error">{err}</p>}
                </td>
                <td>{r.invoice_id !== lockedInvoiceId && <button type="button" aria-label={`Remove ${r.invoice_number}`} onClick={() => onChange(rows.filter((x) => x.invoice_id !== r.invoice_id))}>Remove</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <dl className="alloc-totals">
        <div><dt>Allocated</dt><dd data-testid="allocated">{summary.allocated}</dd></div>
        <div><dt>Unallocated</dt><dd data-testid="unallocated">{summary.unallocated}</dd></div>
      </dl>
      {summary.totalError && <p role="alert" className="field-error">{summary.totalError}</p>}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}>Also pay another invoice of this customer</button>
      ) : (
        <div>
          {open.isPending && <p role="status">Loading invoices…</p>}
          {open.isError && <p role="alert" className="field-error">Could not load this customer's invoices.</p>}
          {open.isSuccess && candidates.length === 0 && <p className="invoice-muted">No other open invoices for this customer.</p>}
          {candidates.length > 0 && (
            <select aria-label="Add invoice" value="" onChange={(e) => {
              const inv = candidates.find((c) => c.id === Number(e.target.value))
              if (inv) onChange([...rows, { invoice_id: inv.id, invoice_number: inv.number, amount_due: inv.amount_due, amount: inv.amount_due }])
            }}>
              <option value="">Add an invoice…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.number} — due {c.amount_due}</option>)}
            </select>
          )}
        </div>
      )}
    </fieldset>
  )
}
