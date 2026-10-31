const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface Health {
  status: string
  service: string
  version: string
}

export interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
    details?: Array<{ field: string; message: string }>
    request_id?: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Array<{ field: string; message: string }>
  readonly requestId?: string
  readonly retryAfter?: string

  constructor(status: number, code: string, message: string, details: Array<{ field: string; message: string }> = [], requestId?: string, retryAfter?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
    this.retryAfter = retryAfter
  }
}

interface RequestOptions extends RequestInit {
  /** Skip the `data` envelope and return the parsed body as-is. */
  raw?: boolean
}

/**
 * Fetch JSON from the Brightloop API and unwrap the `{ "data": ... }` envelope.
 * The session cookie is sent automatically (`credentials: "include"`).
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { raw = false, headers, ...init } = options
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })

  const payload = (await response.json().catch(() => null)) as
    | (T & { data?: T } & ApiErrorPayload)
    | null

  if (!response.ok) {
    const code = payload?.error?.code ?? 'REQUEST_FAILED'
    const message = response.status >= 500
      ? 'The service is unavailable. Please try again.'
      : payload?.error?.message ?? `Request failed with status ${response.status}`
    if (response.status === 401 && !['/auth/me', '/auth/login', '/auth/register'].includes(path)) {
      window.dispatchEvent(new Event('brightloop:unauthenticated'))
    }
    throw new ApiError(response.status, code, message, payload?.error?.details,
      payload?.error?.request_id ?? response.headers.get('x-request-id') ?? undefined,
      response.headers.get('retry-after') ?? undefined)
  }

  if (raw) return payload as T
  return (payload?.data ?? payload) as T
}

export function getHealth(): Promise<Health> {
  return apiRequest<Health>('/health')
}
