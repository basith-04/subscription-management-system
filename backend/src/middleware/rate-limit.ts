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
 * Limit both aggregate attempts from an IP and attempts for an IP/email pair.
 * Email normalization prevents casing and whitespace from resetting the limit.
 */
export function createAuthRateLimiter(config: Config): RequestHandler[] {
  const common = {
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    handler: ((_req, res, next) => {
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
    }) as RequestHandler,
  }
  return [
    rateLimit(common),
    rateLimit({
      ...common,
      keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip ?? '')}:${emailKey(req.body?.email)}`,
    }),
  ]
}
