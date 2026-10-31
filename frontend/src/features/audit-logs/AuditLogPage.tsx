import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { listAuditLogs } from '../../api/audit-logs'
import { DataTable } from '../../components/ui/DataTable'
import { FilterBar } from '../../components/ui/FilterBar'
import { Pagination } from '../../components/ui/Pagination'
import { useState } from 'react'
import { AuditDetailDrawer } from './AuditDetailDrawer'
import type { AuditLog, AuditLogFilters } from './types'

const filterKeys = ['entity_type', 'entity_id', 'actor_user_id', 'action', 'date_from', 'date_to', 'page'] as const
export function AuditLogPage() {
  const [search, setSearch] = useSearchParams(); const [selected, setSelected] = useState<AuditLog | null>(null)
  const filters = Object.fromEntries(filterKeys.map((key) => [key, search.get(key) ?? undefined])) as AuditLogFilters
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['audit-logs', filters], queryFn: () => listAuditLogs(filters) })
  const set = (key: string, value: string) => { const next = new URLSearchParams(search); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setSearch(next) }
  if (isLoading) return <main><h1>Audit log</h1><p aria-busy="true">Loading audit events…</p></main>
  if (isError) return <main><h1>Audit log</h1><p role="alert">Unable to load audit events.</p><button onClick={() => void refetch()}>Retry</button></main>
  const rows = data?.data ?? []
  return <main className="audit-page"><h1>Audit log</h1><p>Read-only history of administrative and system events.</p>
    <FilterBar onClear={() => setSearch({})}>{[['entity_type', 'Entity type'], ['entity_id', 'Entity ID'], ['actor_user_id', 'Actor ID'], ['action', 'Action']].map(([key, label]) => <label key={key}>{label}<input value={search.get(key) ?? ''} onChange={(event) => set(key, event.target.value)} /></label>)}<label>From<input type="datetime-local" value={search.get('date_from') ?? ''} onChange={(event) => set('date_from', event.target.value ? new Date(event.target.value).toISOString() : '')} /></label><label>To<input type="datetime-local" value={search.get('date_to') ?? ''} onChange={(event) => set('date_to', event.target.value ? new Date(event.target.value).toISOString() : '')} /></label></FilterBar>
    {rows.length === 0 ? <p>{search.toString() ? 'No audit events match these filters.' : 'No audit events have been recorded.'}</p> : <DataTable rows={rows} onSelect={setSelected} columns={[{ key: 'created_at', label: 'Timestamp', render: (r) => new Date(r.created_at).toLocaleString() }, { key: 'actor', label: 'Actor', render: (r) => r.actor?.name ?? 'System' }, { key: 'action', label: 'Action', render: (r) => r.action }, { key: 'entity_type', label: 'Entity type', render: (r) => r.entity_type }, { key: 'entity_id', label: 'Entity ID', render: (r) => r.entity_id }, { key: 'ip_address', label: 'IP address', render: (r) => r.ip_address ?? '—' }]} />}
    {data && <Pagination page={data.meta.page} totalPages={data.meta.total_pages} onPage={(page) => set('page', String(page))} />}{selected && <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />}
  </main>
}
