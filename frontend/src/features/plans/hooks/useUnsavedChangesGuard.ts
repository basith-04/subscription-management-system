import { useCallback, useEffect } from 'react'

export const UNSAVED_MESSAGE = 'You have unsaved product changes. Leave without saving?'

/** Warns on tab close/reload while `dirty`, and returns a `confirmLeave()` for in-app navigation. */
export function useUnsavedChangesGuard(dirty: boolean): () => boolean {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return useCallback(() => !dirty || window.confirm(UNSAVED_MESSAGE), [dirty])
}
