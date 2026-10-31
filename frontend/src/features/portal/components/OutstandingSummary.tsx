import { Money } from '../../invoices'
import type { PortalSummary } from '../types'

/** Backend-calculated totals (confirmed, unpaid invoices; cancelled/draft/voided excluded). Never computed here. */
export function OutstandingSummary({ summary }: { summary: PortalSummary }) {
  const overdue = summary.overdue_amount !== '0.00'
  return (
    <dl className="portal-summary" aria-label="Amounts owed">
      <div><dt>Outstanding</dt><dd data-testid="outstanding"><Money value={summary.outstanding_amount} /></dd></div>
      <div className={overdue ? 'is-overdue' : undefined}><dt>Overdue</dt><dd data-testid="overdue"><Money value={summary.overdue_amount} /></dd></div>
    </dl>
  )
}
