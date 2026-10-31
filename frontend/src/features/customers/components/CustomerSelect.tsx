import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listCustomers } from '../../../api/customers'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { CustomerListItem } from '../types'

export interface CustomerSelectProps {
  /** Selected customer id, or null. */
  value: number | null
  /** Called with the chosen customer, or `(null, null)` when cleared. */
  onChange: (customerId: number | null, customer: CustomerListItem | null) => void
  /** Text shown for `value` before the user searches (e.g. the name loaded with a draft). */
  initialLabel?: string
  /** Offer only active customers (default true). */
  activeOnly?: boolean
  disabled?: boolean
  placeholder?: string
  /** Accessible name; defaults to "Customer". */
  label?: string
  /** Debounce before a search request is sent (default 300 ms). */
  debounceMs?: number
}

const RESULT_LIMIT = 10

/**
 * Async customer search select, shared by F04, F09 (quotations) and F13 (payments).
 * Sends `GET /customers?q=<text>&page_size=10[&is_active=true]` only after typing pauses and
 * never loads the whole table. Backend access is Admin/Staff only.
 */
export function CustomerSelect({
  value, onChange, initialLabel = '', activeOnly = true, disabled = false,
  placeholder = 'Search customers…', label = 'Customer', debounceMs = 300,
}: CustomerSelectProps) {
  const listId = useId()
  const [text, setText] = useState(initialLabel)
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const term = useDebouncedValue(text.trim(), debounceMs)
  // While the user is typing, show "Searching…" immediately instead of stale results.
  const pending = searching && term !== text.trim()

  const query = useQuery({
    queryKey: ['customers', 'select', term, activeOnly],
    queryFn: () => listCustomers({ q: term, page_size: RESULT_LIMIT, sort: 'name', ...(activeOnly ? { is_active: true } : {}) }),
    enabled: open && !disabled,
    staleTime: 15_000,
    retry: false,
  })

  const choose = (customer: CustomerListItem) => {
    setText(customer.name)
    setOpen(false)
    setSearching(false)
    onChange(customer.id, customer)
  }
  const clear = () => {
    setText('')
    setSearching(false)
    onChange(null, null)
  }

  const results = query.data?.data ?? []
  return (
    <div className="customer-select">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value)
          setSearching(true)
          setOpen(true)
          if (value !== null) onChange(null, null)
        }}
      />
      {value !== null && !disabled && (
        <button type="button" className="customer-select-clear" aria-label="Clear customer" onClick={clear}>×</button>
      )}
      {open && (
        <ul id={listId} role="listbox" className="customer-select-list">
          {(pending || query.isFetching) && <li role="status" className="customer-select-note">Searching…</li>}
          {query.isError && !pending && (
            <li role="alert" className="customer-select-note">
              Could not search customers.{' '}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void query.refetch()}>Retry</button>
            </li>
          )}
          {!pending && !query.isFetching && !query.isError && results.length === 0 && (
            <li className="customer-select-note">No customers match</li>
          )}
          {!pending && !query.isError && results.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
            >
              <strong>{c.name}</strong>
              <small>{[c.company_name, c.email].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
