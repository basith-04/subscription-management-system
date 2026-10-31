import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyInvoice, getMySubscription, listMyInvoices, listMySubscriptions, performAction } from '../../../api/portal'
import type { CustomerActionName } from '../types'

/** Every portal query key starts with 'me' so one invalidation can refresh everything the customer sees. */
export const meKeys = {
  all: ['me'] as const,
  subscriptions: (p: object = {}) => ['me', 'subscriptions', p] as const,
  subscription: (id: number) => ['me', 'subscription', id] as const,
  invoices: (p: object = {}) => ['me', 'invoices', p] as const,
  invoice: (id: number) => ['me', 'invoice', id] as const,
}

export const useMySubscriptions = (p: { status?: string; page?: number; page_size?: number } = {}) =>
  useQuery({ queryKey: meKeys.subscriptions(p), queryFn: () => listMySubscriptions(p), placeholderData: keepPreviousData, retry: false })
export const useMySubscription = (id: number) => useQuery({ queryKey: meKeys.subscription(id), queryFn: () => getMySubscription(id), retry: false })
export const useMyInvoices = (p: { status?: string; payment_state?: string; page?: number; page_size?: number } = {}) =>
  useQuery({ queryKey: meKeys.invoices(p), queryFn: () => listMyInvoices(p), placeholderData: keepPreviousData, retry: false })
export const useMyInvoice = (id: number) => useQuery({ queryKey: meKeys.invoice(id), queryFn: () => getMyInvoice(id), retry: false })

/** After any action refresh the lists, the detail, the home summary and the invoices (renewals/closures can affect billing). */
export function useCustomerAction(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (action: CustomerActionName) => performAction(action, id),
    onSettled: () => client.invalidateQueries({ queryKey: meKeys.all }),
  })
}
