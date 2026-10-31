import type { PaymentState } from './types'

const LABELS: Record<PaymentState, string> = {
  draft: 'Draft', not_due: 'Not yet due', outstanding: 'Outstanding', partially_paid: 'Partially paid',
  overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled',
}

export const paymentStateLabel = (state: PaymentState): string => LABELS[state] ?? state
