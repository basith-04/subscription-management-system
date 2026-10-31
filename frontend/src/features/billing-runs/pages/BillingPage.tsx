import { Link } from 'react-router-dom'
import { useBillingRuns, useUpcomingSubscriptions } from '../hooks/useBillingRuns'
import { RunBillingButton } from '../components/RunBillingButton'
import { useAuth } from '../../../lib/auth-context'
import { formatDate } from '../../../lib/dates'

export function BillingPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const runs = useBillingRuns()
  const upcoming = useUpcomingSubscriptions()

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Billing</h1>
        <RunBillingButton isAdmin={isAdmin} />
      </div>

      <section className="mb-8" style={{ marginBottom: '3rem' }}>
        <h2>Upcoming (Next 7 Days)</h2>
        {upcoming.isLoading ? <p>Loading...</p> : (
          <table className="data-table">
            <thead>
              <tr><th>Subscription</th><th>Customer</th><th>Next Billing Date</th></tr>
            </thead>
            <tbody>
              {upcoming.data?.map(sub => (
                <tr key={sub.id}>
                  <td>{sub.number}</td>
                  <td>{sub.customer_id}</td>
                  <td>{formatDate(sub.next_billing_date)}</td>
                </tr>
              ))}
              {upcoming.data?.length === 0 && (
                <tr><td colSpan={3}>Nothing due.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Run History</h2>
        {runs.isLoading ? <p>Loading...</p> : (
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Date</th><th>Status</th><th>Created</th><th>Errors</th></tr>
            </thead>
            <tbody>
              {runs.data?.data.map(run => (
                <tr key={run.id}>
                  <td><Link to={`/app/billing/${run.id}`}>#{run.id}</Link></td>
                  <td>{formatDate(run.run_date)}</td>
                  <td>
                    <span className={`badge badge-${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td>{run.invoices_created}</td>
                  <td>{run.errors_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
