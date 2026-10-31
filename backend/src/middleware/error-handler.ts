import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ApiError, isApiError, type FieldError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'

export { ApiError, type FieldError } from '../lib/errors.js'

interface BodyParserError {
  status?: number
  type?: string
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
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
  const bodyParserError = error as BodyParserError
  const malformedJson =
    bodyParserError?.type === 'entity.parse.failed' ||
    (bodyParserError?.status === 400 && error instanceof SyntaxError)

  const apiError = isApiError(error)
    ? error
    : malformedJson
      ? new ApiError(
          400,
          ERROR_CODES.MALFORMED_JSON,
          'Request body is not valid JSON',
        )
      : undefined

  const status = apiError?.status ?? 500
  const code = apiError?.code ?? ERROR_CODES.INTERNAL_ERROR
  const message = apiError?.message ?? 'Internal server error'

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
      ...(apiError?.details ? { details: apiError.details } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
  }

  res.status(status).json(body)
}
