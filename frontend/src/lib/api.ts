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

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
    const message =
      payload?.error?.message ?? `Request failed with status ${response.status}`
    throw new ApiError(response.status, code, message)
  }

  if (raw) return payload as T
  return (payload?.data ?? payload) as T
}

export function getHealth(): Promise<Health> {
  return apiRequest<Health>('/health')
}
