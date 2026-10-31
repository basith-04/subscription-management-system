import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listInvoicePayments, listPayments, recordPayment, voidPayment } from '../../../api/payments'
import type { PaymentListParams, RecordPaymentPayload } from '../types'

export const paymentKeys = {
  all: ['payments'] as const,
  list: (p: PaymentListParams) => ['payments', 'list', p] as const,
  forInvoice: (id: number) => ['payments', 'invoice', id] as const,
}

export const usePaymentList = (params: PaymentListParams) =>
  useQuery({ queryKey: paymentKeys.list(params), queryFn: () => listPayments(params), placeholderData: keepPreviousData, retry: false })

export const useInvoicePayments = (invoiceId: number) =>
  useQuery({ queryKey: paymentKeys.forInvoice(invoiceId), queryFn: () => listInvoicePayments(invoiceId), retry: false })

/** A payment changes balances everywhere: refresh payments, invoices (detail/list/summary), customers and the dashboard. */
function useRefreshAfterWrite() {
  const client = useQueryClient()
  return () => Promise.all(['payments', 'invoices', 'customers', 'dashboard'].map((k) => client.invalidateQueries({ queryKey: [k] })))
}

export function useRecordPayment() {
  const refresh = useRefreshAfterWrite()
  return useMutation({ mutationFn: (p: RecordPaymentPayload) => recordPayment(p), onSuccess: refresh })
}
export function useVoidPayment(id: number) {
  const refresh = useRefreshAfterWrite()
  return useMutation({ mutationFn: (reason: string) => voidPayment(id, reason), onSuccess: refresh })
}
