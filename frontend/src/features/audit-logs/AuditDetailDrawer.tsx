import type { AuditLog } from './types'

function JsonPanel({ value, label }: { value: unknown | null; label: string }) {
  return <section><h3>{label}</h3><pre>{value === null ? 'No values recorded' : JSON.stringify(value, null, 2)}</pre></section>
}
export function AuditDetailDrawer({ entry, onClose }: { entry: AuditLog; onClose: () => void }) {
  return <aside className="audit-drawer" role="dialog" aria-modal="true" aria-label="Audit event detail"><button onClick={onClose}>Close</button><h2>{entry.action}</h2>
    <dl><dt>Entity</dt><dd>{entry.entity_type} #{entry.entity_id}</dd><dt>Actor</dt><dd>{entry.actor?.name ?? 'System'}</dd><dt>IP address</dt><dd>{entry.ip_address ?? 'Not recorded'}</dd><dt>Timestamp</dt><dd>{new Date(entry.created_at).toLocaleString()}</dd></dl>
    <JsonPanel label="Old values" value={entry.old_values} /><JsonPanel label="New values" value={entry.new_values} />
  </aside>
}
