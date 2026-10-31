import { useState } from 'react'
import { useTriggerRun } from '../hooks/useBillingRuns'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Toast } from '../../../components/ui/Toast'

export function RunBillingButton({ isAdmin }: { isAdmin: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const mutation = useTriggerRun()

  if (!isAdmin) return null

  const handleConfirm = async () => {
    setIsOpen(false)
    try {
      await mutation.mutateAsync(undefined)
      setToast('Billing run started.')
    } catch (err: any) {
      setToast(err.message || 'Failed to start run.')
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={mutation.isPending}
        className="btn-primary"
      >
        {mutation.isPending ? 'Starting...' : 'Run Billing Now'}
      </button>

      <ConfirmDialog
        isOpen={isOpen}
        title="Run Billing Now"
        message="This will generate draft invoices for all due subscriptions. Are you sure?"
        confirmLabel="Run Billing"
        onConfirm={handleConfirm}
        onCancel={() => setIsOpen(false)}
      />

      {toast && <Toast message={toast} type={mutation.isError ? 'error' : 'success'} onClose={() => setToast(null)} />}
    </>
  )
}
