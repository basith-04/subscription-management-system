import type { ErrorRequestHandler, RequestHandler } from 'express'

export interface FieldError {
  field: string
  message: string
}

/**
 * Application error carrying the HTTP status and machine-readable code used
 * by the API error envelope.
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

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ApiError(
      404,
      'NOT_FOUND',
      `Route not found: ${req.method} ${req.originalUrl}`,
    ),
  )
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  const isApiError = error instanceof ApiError
  const status = isApiError ? error.status : 500
  const code = isApiError ? error.code : 'INTERNAL_ERROR'
  const message =
    status >= 500 ? 'Internal server error' : (error as Error).message

  if (status >= 500) {
    console.error('[api] unhandled error', error)
  }

  const requestId = res.locals.requestId as string | undefined
  const body: {
    error: {
      code: string
      message: string
      details?: FieldError[]
      request_id?: string
    }
  } = {
    error: {
      code,
      message,
      ...(isApiError && error.details ? { details: error.details } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
  }

  res.status(status).json(body)
}
