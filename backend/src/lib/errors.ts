export interface FieldError {
  field: string
  message: string
}

/**
 * Application error carrying the HTTP status and machine-readable code used by
 * the API error envelope.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: FieldError[]

  constructor(
    status: number,
    code: string,
    message: string,
    details?: FieldError[],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
