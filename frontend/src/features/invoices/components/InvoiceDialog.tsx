import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface InvoiceDialogProps {
  title: string
  onClose: () => void
  /** Block closing (Esc / backdrop) while a request is in flight. */
  busy?: boolean
  children: ReactNode
}

/** Minimal accessible modal shared by the send and cancel dialogs (the shared ui/Modal is still a placeholder). */
export function InvoiceDialog({ title, onClose, busy = false, children }: InvoiceDialogProps) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div className="invoice-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="invoice-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
