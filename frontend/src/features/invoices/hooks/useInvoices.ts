import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  bulkConfirmInvoices, cancelInvoice, confirmInvoice, getInvoice, listInvoices, sendInvoice, updateInvoiceDraft,
} from '../../../api/invoices'
import type { InvoiceListParams, SendInvoicePayload, UpdateDraftPayload } from '../types'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (params: InvoiceListParams) => ['invoices', 'list', params] as const,
  detail: (id: number) => ['invoices', 'detail', id] as const,
}

export function useInvoiceList(params: InvoiceListParams) {
  return useQuery({ queryKey: invoiceKeys.list(params), queryFn: () => listInvoices(params), placeholderData: keepPreviousData, retry: false })
}

export function useInvoice(id: number) {
  return useQuery({ queryKey: invoiceKeys.detail(id), queryFn: () => getInvoice(id), retry: false })
}

/** Any invoice write invalidates every invoice query (list, summary and detail). */
function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: invoiceKeys.all })
}

export function useConfirmInvoice(id: number) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: () => confirmInvoice(id), onSettled: invalidate })
}
export function useCancelInvoice(id: number) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (reason: string) => cancelInvoice(id, reason), onSettled: invalidate })
}
export function useSendInvoice(id: number) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (payload: SendInvoicePayload) => sendInvoice(id, payload), onSettled: invalidate })
}
export function useUpdateDraft(id: number) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (payload: UpdateDraftPayload) => updateInvoiceDraft(id, payload), onSettled: invalidate })
}
export function useBulkConfirm() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (ids: number[]) => bulkConfirmInvoices(ids), onSettled: invalidate })
}
