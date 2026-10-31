import type { ReactNode } from 'react'

export interface DataTableColumn<T> { key: string; label: string; render: (row: T) => ReactNode }
export function DataTable<T extends { id: number | string }>({ columns, rows, onSelect }: { columns: DataTableColumn<T>[]; rows: T[]; onSelect?: (row: T) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} onClick={() => onSelect?.(row)} tabIndex={onSelect ? 0 : undefined} onKeyDown={(event) => { if (onSelect && event.key === 'Enter') onSelect(row) }}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
  </table></div>
}
