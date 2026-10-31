// Public API of the payments module — exports service functions only.
// F04 (customer detail) and F16 (dashboard/reports) read outstanding/overdue totals through getBalanceTotals;
// F14 (portal) can reuse listForInvoice for payment history.
export { getBalanceTotals, listForInvoice } from './payments.service.js'
export type { BalanceTotals, PaymentDto, PaymentWithInvoices } from './payments.service.js'
export { reconciliationMismatches } from './payments.repository.js'
export { createPaymentsRouter, createInvoicePaymentsRouter } from './payments.routes.js'
