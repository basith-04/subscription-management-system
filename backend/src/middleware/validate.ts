import type { RequestHandler } from 'express'
import { ZodError, type ZodSchema } from 'zod'
import { ApiError, type FieldError } from './error-handler.js'

export interface ValidateSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (schemas.params) {
        const parsedParams = await schemas.params.parseAsync(req.params)
        Object.defineProperty(req, 'params', {
          value: parsedParams,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
      if (schemas.query) {
        const parsedQuery = await schemas.query.parseAsync(req.query)
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body)
      }
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const details: FieldError[] = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }))
        next(
          new ApiError(
            422,
            'VALIDATION_ERROR',
            'Validation failed',
            details,
          ),
        )
        return
      }
      next(error)
    }
  }
}
