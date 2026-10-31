import type { PaymentMethod } from './types'

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', upi: 'UPI', cheque: 'Cheque', other: 'Other',
}
