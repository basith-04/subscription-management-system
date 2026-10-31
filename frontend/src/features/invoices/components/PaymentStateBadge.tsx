import type { PaymentState } from '../types'
import { paymentStateLabel } from '../paymentStateLabel'

/** Coloured, text-labelled badge (never colour-only). Exported for F13/F14/F16 lists. */
export function PaymentStateBadge({ state }: { state: PaymentState }) {
  return <span className={`payment-badge payment-badge--${state}`} data-state={state}>{paymentStateLabel(state)}</span>
}
