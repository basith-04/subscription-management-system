import type { ReactNode } from 'react'

export function FilterBar({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>{children}<button type="button" onClick={onClear}>Clear filters</button></form>
}
