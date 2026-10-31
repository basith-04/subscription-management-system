import { Link, useParams } from 'react-router-dom'
import { InvoiceDocument, Money } from '../../invoices'
import '../../invoices/invoices.css'
import { PortalNotFound } from '../components/PortalNotFound'
import { QueryState } from '../components/QueryState'
import { useMyInvoice } from '../hooks/usePortal'

const METHODS: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', upi: 'UPI', cheque: 'Cheque', other: 'Other' }

/** The invoice is rendered by F11's InvoiceDocument (same layout staff print). Print uses the browser with print CSS. */
export function MyInvoiceDetailPage() {
  const id = Number(useParams().id)
  const valid = Number.isSafeInteger(id) && id > 0
  const q = useMyInvoice(valid ? id : 0)
  if (!valid) return <PortalNotFound what="invoice" />
  return (
    <div className="portal-stack">
      <p className="no-print"><Link to="/portal/invoices">← My invoices</Link></p>
      <QueryState query={q} what="invoice">
        {q.data && (
          <>
            <div className="portal-actions no-print">
              <button type="button" className="portal-button portal-button--primary" onClick={() => window.print()}>Print</button>
            </div>
            <InvoiceDocument invoice={q.data} />
            <section className="portal-card" aria-label="Payments">
              <h2>Payments</h2>
              {q.data.payments.length === 0 ? <p className="portal-muted">No payments recorded yet.</p> : (
                <ul className="portal-list">
                  {q.data.payments.map((p) => (
                    <li key={p.id} className={p.is_voided ? 'is-voided' : undefined}>
                      {p.payment_date} · {METHODS[p.method] ?? p.method} · <Money value={p.amount} />{p.reference_number ? ` · ${p.reference_number}` : ''}
                      {p.is_voided && <span className="portal-badge portal-badge--closed"> Voided</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </QueryState>
    </div>
  )
}
