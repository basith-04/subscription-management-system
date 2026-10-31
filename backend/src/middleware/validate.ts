import type { RequestHandler } from 'express'
import { ZodError, type ZodType } from 'zod'
import { ApiError, type FieldError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'

export interface ValidationSchemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }))
}

/**
 * Parse and replace request input with the validated value. Unknown fields are
 * rejected when the module schema is strict.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params
      }
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ApiError(
            422,
            ERROR_CODES.VALIDATION_ERROR,
            'Invalid input',
            toFieldErrors(error),
          ),
        )
        return
      }

      next(error)
    }
  }
}
