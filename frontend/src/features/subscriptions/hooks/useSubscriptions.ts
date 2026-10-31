import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelQuotation, confirmQuotation, createQuotation, getHistory, getSubscription, getTemplate, issueQuotation, listPaymentTerms,
  listQuotations, listSubscriptions, listTaxRules, listTemplates, updateQuotation,
} from '../../../api/subscriptions'
import type { ListParams, SubscriptionPayload } from '../types'

export const subKeys = {
  all: ['subscriptions'] as const,
  list: (kind: string, p: ListParams) => ['subscriptions', 'list', kind, p] as const,
  detail: (id: number) => ['subscriptions', 'detail', id] as const,
  history: (id: number) => ['subscriptions', 'history', id] as const,
}

export const useQuotationList = (p: ListParams) =>
  useQuery({ queryKey: subKeys.list('quotations', p), queryFn: () => listQuotations(p), placeholderData: keepPreviousData, retry: false })
export const useSubscriptionList = (p: ListParams) =>
  useQuery({ queryKey: subKeys.list('subscriptions', p), queryFn: () => listSubscriptions(p), placeholderData: keepPreviousData, retry: false })
export const useSubscription = (id: number | null) =>
  useQuery({ queryKey: subKeys.detail(id ?? 0), queryFn: () => getSubscription(id as number), enabled: id !== null, retry: false })
export const useHistory = (id: number) => useQuery({ queryKey: subKeys.history(id), queryFn: () => getHistory(id), retry: false })
export const useTaxRules = () => useQuery({ queryKey: ['lookups', 'taxes'], queryFn: listTaxRules, staleTime: 60_000, retry: false })
export const usePaymentTerms = () => useQuery({ queryKey: ['lookups', 'payment-terms'], queryFn: listPaymentTerms, staleTime: 60_000, retry: false })
export const useTemplates = () => useQuery({ queryKey: ['lookups', 'templates'], queryFn: listTemplates, staleTime: 60_000, retry: false })
export const useTemplate = (id: number | null) =>
  useQuery({ queryKey: ['lookups', 'template', id], queryFn: () => getTemplate(id as number), enabled: id !== null, retry: false })

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: subKeys.all })
}
export function useCreateQuotation() {
  const refresh = useInvalidate()
  return useMutation({ mutationFn: (p: SubscriptionPayload) => createQuotation(p), onSuccess: refresh })
}
export function useUpdateQuotation(id: number) {
  const refresh = useInvalidate()
  return useMutation({ mutationFn: (p: Partial<SubscriptionPayload>) => updateQuotation(id, p), onSuccess: refresh })
}
export function useLifecycle(id: number) {
  const refresh = useInvalidate()
  return {
    issue: useMutation({ mutationFn: (validUntil?: string) => issueQuotation(id, validUntil), onSettled: refresh }),
    confirm: useMutation({ mutationFn: () => confirmQuotation(id), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (reason?: string) => cancelQuotation(id, reason), onSettled: refresh }),
  }
}
