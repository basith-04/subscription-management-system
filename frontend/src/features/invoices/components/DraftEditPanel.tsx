import { useState, type FormEvent } from 'react'
import { ApiError } from '../../../lib/api'
import { useUpdateDraft } from '../hooks/useInvoices'
import type { InvoiceDetail } from '../types'
import { Money } from './Money'

/** Draft-only edits: due date, notes, remove a line. The server re-checks that the invoice is still a draft. */
export function DraftEditPanel({ invoice, onConflict }: { invoice: InvoiceDetail; onConflict: () => void }) {
  const [dueDate, setDueDate] = useState(invoice.due_date)
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const update = useUpdateDraft(invoice.id)

  async function run(payload: Parameters<typeof update.mutateAsync>[0]) {
    if (update.isPending) return
    setError(''); setSaved(false)
    try {
      await update.mutateAsync(payload)
      setSaved(true)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onConflict()
      setError(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : 'Could not save changes.')
    }
  }
  function save(e: FormEvent) {
    e.preventDefault()
    const payload: { due_date?: string; notes?: string | null } = {}
    if (dueDate !== invoice.due_date) payload.due_date = dueDate
    if (notes !== (invoice.notes ?? '')) payload.notes = notes.trim() === '' ? null : notes
    if (!Object.keys(payload).length) return setError('Nothing to save.')
    void run(payload)
  }

  return (
    <section className="invoice-slot" aria-label="Edit draft">
      <h2>Edit draft</h2>
      <form onSubmit={save} className="invoice-form" noValidate>
        <label htmlFor="draft-due">Due date</label>
        <input id="draft-due" type="date" value={dueDate} min={invoice.issue_date} onChange={(e) => setDueDate(e.target.value)} disabled={update.isPending} />
        <label htmlFor="draft-notes">Notes</label>
        <textarea id="draft-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={update.isPending} />
        <div className="invoice-actions"><button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <h3>Lines</h3>
      <ul className="invoice-line-list">
        {invoice.items.map((item) => (
          <li key={item.id}>
            <span>{item.description} — <Money value={item.line_total} /></span>
            <button type="button" disabled={update.isPending || invoice.items.length <= 1}
              aria-label={`Remove line ${item.description}`} onClick={() => void run({ remove_item_ids: [item.id] })}>Remove</button>
          </li>
        ))}
      </ul>
      {invoice.items.length <= 1 && <p className="invoice-muted">An invoice must keep at least one line; cancel it instead.</p>}
      {saved && <p role="status" className="invoice-flash">Draft updated.</p>}
      {error && <p role="alert" className="invoice-error">{error}</p>}
    </section>
  )
}
