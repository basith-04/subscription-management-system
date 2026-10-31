// Zod request validation — converts issues to 422 VALIDATION_ERROR with field details.
import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { ApiError } from './error-handler.js'

export interface ValidationSpec {
  body?: ZodType
  params?: ZodType
  query?: ZodType
}

interface ZodLikeError {
  issues: Array<{ path: (string | number)[]; message: string }>
}

function isZodError(error: unknown): error is ZodLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  )
}

export function validate(spec: ValidationSpec): RequestHandler {
  return (req, _res, next) => {
    try {
      if (spec.body) req.body = spec.body.parse(req.body)
      if (spec.params) req.params = spec.params.parse(req.params) as typeof req.params
      if (spec.query) req.query = spec.query.parse(req.query) as typeof req.query
      next()
    } catch (error) {
      if (isZodError(error)) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }))
        return next(new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', details))
      }
      next(error)
    }
  }
}