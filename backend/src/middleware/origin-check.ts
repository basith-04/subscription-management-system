import type { RequestHandler } from 'express'
import type { Config } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence-in-depth for cookie-authenticated state changes. Browsers send
 * Origin on cross-site POSTs; non-browser clients without Origin are allowed.
 */
export function originCheck(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }

    const origin = req.get('origin')
    if (!origin || config.allowedOrigins.includes(origin)) {
      next()
      return
    }

    next(
      new ApiError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Request origin is not allowed',
      ),
    )
  }
}
