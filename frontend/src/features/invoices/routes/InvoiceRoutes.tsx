import { Navigate, useParams } from 'react-router-dom'
import { InvoiceDetailPage } from '../pages/InvoiceDetailPage'
import { InvoiceListPage } from '../pages/InvoiceListPage'
import { InvoicePrintPage } from '../pages/InvoicePrintPage'

const validId = (raw: string | undefined) => { const id = Number(raw); return Number.isSafeInteger(id) && id > 0 ? id : null }

export function InvoiceListRoute() { return <InvoiceListPage /> }

export function InvoiceDetailRoute() {
  const id = validId(useParams().id)
  return id ? <InvoiceDetailPage id={id} /> : <Navigate to="/app/invoices" replace />
}

export function InvoicePrintRoute() {
  const id = validId(useParams().id)
  return id ? <InvoicePrintPage id={id} /> : <Navigate to="/app/invoices" replace />
}
