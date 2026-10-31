import type { RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { Config } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'
import { normalizeEmail } from '../lib/text.js'

function emailKey(value: unknown): string {
  return typeof value === 'string' ? normalizeEmail(value) : 'anonymous'
}

/**
 * Strict limiter for credential endpoints, keyed by IP + normalized email so
 * changing the case or whitespace of an email does not reset the counter.
 */
export function createAuthRateLimiter(config: Config): RequestHandler {
  return rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip ?? '')}:${emailKey(req.body?.email)}`,
    handler: (_req, res, next) => {
      res.setHeader(
        'Retry-After',
        String(Math.ceil(config.authRateLimit.windowMs / 1000)),
      )
      next(
        new ApiError(
          429,
          ERROR_CODES.RATE_LIMITED,
          'Too many attempts. Please try again later.',
        ),
      )
    },
  })
}
