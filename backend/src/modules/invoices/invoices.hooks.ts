// Cross-feature integration hooks owned by F11 but implemented by later features.
// F15 (discounts) replaces `releaseDiscountRedemption` when it lands, e.g.
//   invoiceHooks.releaseDiscountRedemption = discounts.releaseRedemption
// Until then it is a documented no-op. Always called inside the cancel transaction.
import type { Queryable } from '../../lib/db.js'

export interface InvoiceHooks {
  /** Restore any discount redemption used by `invoiceId`. Runs in the caller's transaction. */
  releaseDiscountRedemption(tx: Queryable, invoiceId: number): Promise<void>
}

export const invoiceHooks: InvoiceHooks = {
  async releaseDiscountRedemption() {
    // No-op until F15 implements discount redemptions.
  },
}
