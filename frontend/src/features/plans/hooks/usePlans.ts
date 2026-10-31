import { useCallback, useEffect, useState } from 'react'
import { getPlan, listPlans, type PlanListResult } from '../../../api/plans'
import type { PlanDetail, PlanListFilters } from '../types'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const loader = useCallback(load, deps)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loader().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (e: unknown) =>
        !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : 'Request failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [loader, tick])
  return [state, () => setTick((t) => t + 1)]
}

export const usePlanList = (filters: PlanListFilters) =>
  useLoad<PlanListResult>(() => listPlans(filters), [JSON.stringify(filters)])

export const usePlan = (id: number) => useLoad<PlanDetail>(() => getPlan(id), [id])
