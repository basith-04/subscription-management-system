import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../../../api/billing-runs'

export function useBillingRuns(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['billing-runs', page, pageSize],
    queryFn: () => api.getRuns(page, pageSize),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.data?.some((r) => r.status === 'running')) return 2000
      return false
    },
  })
}

export function useBillingRunDetail(id: number) {
  return useQuery({
    queryKey: ['billing-runs', id],
    queryFn: () => api.getRunDetail(id),
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'running' ? 2000 : false
    },
  })
}

export function useUpcomingSubscriptions(days = 7) {
  return useQuery({
    queryKey: ['billing-upcoming', days],
    queryFn: () => api.getUpcoming(days),
  })
}

export function useTriggerRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (asOf?: string) => api.triggerRun(asOf),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-runs'] })
    },
  })
}

export function useCreateManualInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId, periodStart }: { subscriptionId: number, periodStart: string }) =>
      api.createManualInvoice(subscriptionId, periodStart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
