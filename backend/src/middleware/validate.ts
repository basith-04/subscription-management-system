// Zod request validation — converts issues to 422 VALIDATION_ERROR with field details.
import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { ApiError, type FieldError } from './error-handler.js'

export interface ValidationSpec {
  body?: ZodType
  params?: ZodType
  query?: ZodType
}

export type ValidateSchemas = ValidationSpec

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
  return async (req, res, next) => {
    try {
      if (spec.params) {
        const parsedParams = await spec.params.parseAsync(req.params)
        Object.defineProperty(req, 'params', {
          value: parsedParams,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
      if (spec.query) {
        const parsedQuery = await spec.query.parseAsync(req.query)
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          enumerable: true,
          configurable: true,
        })
        res.locals.query = parsedQuery
      }
      if (spec.body) {
        req.body = await spec.body.parseAsync(req.body)
      }
      next()
    } catch (error) {
      if (isZodError(error)) {
        const details: FieldError[] = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }))
        return next(
          new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', details),
        )
      }
      next(error)
    }
  }
}
