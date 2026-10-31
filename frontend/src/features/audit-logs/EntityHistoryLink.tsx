import { Link } from 'react-router-dom'

export function EntityHistoryLink({ entityType, entityId, children = 'View history' }: { entityType: string; entityId: number | string; children?: string }) {
  const search = new URLSearchParams({ entity_type: entityType, entity_id: String(entityId) })
  return <Link to={`/app/settings/audit-log?${search.toString()}`}>{children}</Link>
}
