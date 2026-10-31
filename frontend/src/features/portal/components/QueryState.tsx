import type { ReactNode } from 'react'
import { ApiError } from '../../../lib/api'
import { PortalNotFound } from './PortalNotFound'

interface QueryLike { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

/** Shared loading skeleton / 404 / error-with-retry wrapper for portal queries. */
export function QueryState({ query, what, children }: { query: QueryLike; what: string; children: ReactNode }) {
  if (query.isPending) return <div className="portal-skeleton" role="status" aria-busy="true">Loading…</div>
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <PortalNotFound what={what} />
    return (
      <div className="portal-card portal-error" role="alert">
        <p>We couldn’t load this right now.</p>
        <button type="button" onClick={() => void query.refetch()}>Try again</button>
      </div>
    )
  }
  return <>{children}</>
}
