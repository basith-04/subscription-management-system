import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/api'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { useInvoice } from '../hooks/useInvoices'
import '../invoices.css'

/** Standalone print view: no app chrome, A4-like width, opens the browser print dialog once loaded. */
export function InvoicePrintPage({ id: idProp, autoPrint = true }: { id?: number; autoPrint?: boolean } = {}) {
  const params = useParams()
  const id = idProp ?? Number(params.id)
  const query = useInvoice(id)
  const printed = useRef(false)

  useEffect(() => {
    if (autoPrint && query.data && !printed.current) {
      printed.current = true
      window.print()
    }
  }, [autoPrint, query.data])

  if (query.isPending) return <main className="invoice-print" aria-busy="true"><p role="status">Loading invoice…</p></main>
  if (query.isError || !query.data) {
    return (
      <main className="invoice-print">
        <p role="alert" className="invoice-error">
          {query.error instanceof ApiError && query.error.status === 404 ? 'Invoice not found.' : 'Unable to load this invoice.'}
        </p>
      </main>
    )
  }
  return (
    <main className="invoice-print">
      <div className="no-print invoice-print__bar">
        <button type="button" onClick={() => window.print()}>Print</button>
      </div>
      <InvoiceDocument invoice={query.data} />
    </main>
  )
}
