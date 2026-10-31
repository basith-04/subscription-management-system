import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, getCustomer, getOwnProfile, listCustomers, updateCustomer, updateOwnProfile } from '../../../api/customers'
import type { CustomerListParams, CustomerPayload, OwnProfilePayload } from '../types'

export const customerKeys = {
  all: ['customers'] as const,
  list: (params: CustomerListParams) => ['customers', 'list', params] as const,
  detail: (id: number) => ['customers', 'detail', id] as const,
  profile: ['me', 'profile'] as const,
}

export const useCustomerList = (params: CustomerListParams) =>
  useQuery({ queryKey: customerKeys.list(params), queryFn: () => listCustomers(params), placeholderData: (prev) => prev })

export const useCustomer = (id: number) => useQuery({ queryKey: customerKeys.detail(id), queryFn: () => getCustomer(id) })

export const useOwnProfile = () => useQuery({ queryKey: customerKeys.profile, queryFn: getOwnProfile })

export function useCreateCustomer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomerPayload) => createCustomer(payload),
    onSuccess: () => client.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

export function useUpdateCustomer(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CustomerPayload> & { is_active?: boolean }) => updateCustomer(id, payload),
    onSuccess: () => client.invalidateQueries({ queryKey: customerKeys.all }),
  })
}

export function useUpdateOwnProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<OwnProfilePayload>) => updateOwnProfile(payload),
    onSuccess: (data) => client.setQueryData(customerKeys.profile, data),
  })
}
