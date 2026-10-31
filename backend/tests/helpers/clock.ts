import { vi } from 'vitest'

export function mockTime(isoDate: string): void {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${isoDate}T12:00:00Z`))
}

export function restoreTime(): void {
  vi.useRealTimers()
}
