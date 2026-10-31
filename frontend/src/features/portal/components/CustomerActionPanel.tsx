import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { ApiError } from '../../../lib/api'
import { useCustomerAction } from '../hooks/usePortal'
import type { CustomerActionName, CustomerActions } from '../types'

const ACTIONS: Array<{ name: CustomerActionName; flag: keyof CustomerActions; label: string; title: string; message: string; destructive?: boolean }> = [
  { name: 'confirm', flag: 'can_confirm', label: 'Confirm quotation', title: 'Confirm this quotation?', message: 'You are accepting the quotation. Your subscription starts on its start date.' },
  { name: 'pause', flag: 'can_pause', label: 'Pause', title: 'Pause this subscription?', message: 'Billing stops until you resume.' },
  { name: 'resume', flag: 'can_resume', label: 'Resume', title: 'Resume this subscription?', message: 'Billing restarts from today.' },
  { name: 'renew', flag: 'can_renew', label: 'Renew', title: 'Renew this subscription?', message: 'Your subscription is extended by one term.' },
  { name: 'close', flag: 'can_close', label: 'Close subscription', title: 'Close this subscription?', message: 'Billing stops and the subscription ends. This cannot be undone.', destructive: true },
]

/** Buttons are rendered strictly from the server's `can_*` flags; the server re-checks every action regardless. */
export function CustomerActionPanel({ subscriptionId, actions }: { subscriptionId: number; actions: CustomerActions }) {
  const run = useCustomerAction(subscriptionId)
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const available = ACTIONS.filter((a) => actions[a.flag])

  async function confirm() {
    const action = pending
    setPending(null)
    if (!action || run.isPending) return
    setMessage(null)
    try {
      await run.mutateAsync(action.name)
      setMessage({ kind: 'ok', text: `${action.label} completed.` })
    } catch (e) {
      const text = e instanceof ApiError
        ? (e.status === 403 ? `Your plan doesn’t allow this: ${e.message}` : e.status === 404 ? 'This is no longer available.' : e.message)
        : 'Something went wrong. Please try again.'
      setMessage({ kind: 'error', text })
    }
  }

  return (
    <section className="portal-card" aria-label="Actions">
      <h2>Actions</h2>
      {available.length === 0 && <p className="portal-muted">No actions are available for this subscription right now.</p>}
      <div className="portal-actions">
        {available.map((a) => (
          <button key={a.name} type="button" className={`portal-button${a.destructive ? ' portal-button--danger' : ' portal-button--primary'}`}
            disabled={run.isPending} onClick={() => setPending(a)}>{a.label}</button>
        ))}
      </div>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'portal-error-text' : 'portal-ok-text'}>{message.text}</p>}
      <ConfirmDialog isOpen={pending !== null} title={pending?.title ?? ''} message={pending?.message ?? ''} confirmLabel={pending?.label ?? 'Confirm'}
        isDestructive={pending?.destructive ?? false} onConfirm={() => void confirm()} onCancel={() => setPending(null)} />
    </section>
  )
}
