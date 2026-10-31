export interface CookieConfig {
  name: string
  secure: boolean
  sameSite: 'lax'
  maxAgeMs: number
  domain?: string
}

export interface RateLimitConfig {
  windowMs: number
  max: number
}

export interface Config {
  env: string
  isProduction: boolean
  host: string
  port: number
  allowedOrigins: string[]
  databaseUrl: string
  testDatabaseUrl: string
  jwtSecret: string
  cookie: CookieConfig
  authRateLimit: RateLimitConfig
}

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:5173'
const DEFAULT_DATABASE_URL =
  'postgres://postgres:postgres@localhost:5432/brightloop'
const DEFAULT_TEST_DATABASE_URL =
  'postgres://postgres:postgres@localhost:5432/brightloop_test'
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please'
const HOUR_MS = 60 * 60 * 1000

function parseInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw === '') return fallback

  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${name}: ${raw}`)
  }

  return value
}

function parseBoolean(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`Invalid ${name}: expected true or false`)
}

/**
 * Read configuration from the process environment.
 *
 * Development defaults point at a local PostgreSQL database and a throwaway JWT
 * secret. Production requires an explicit JWT secret and refuses wildcard CORS
 * origins with credentials.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = parseInteger('PORT', env.PORT, 4000, 1, 65535)
  const runtimeEnv = env.APP_ENV ?? env.NODE_ENV ?? 'development'
  const isProduction = runtimeEnv === 'production'

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (allowedOrigins.includes('*')) {
    throw new Error(
      'ALLOWED_ORIGINS cannot contain "*" because credentialed CORS is enabled',
    )
  }

  const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET
  if (isProduction && jwtSecret === DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }

  const sessionTtlHours = parseInteger(
    'SESSION_TTL_HOURS',
    env.SESSION_TTL_HOURS,
    8,
    1,
    24 * 7,
  )
  const cookieSecure = parseBoolean(
    'COOKIE_SECURE',
    env.COOKIE_SECURE,
    isProduction,
  )
  if (isProduction && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production')
  }
  const rateLimitWindowMs = parseInteger(
    'RATE_LIMIT_WINDOW_MS',
    env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    1000,
    24 * HOUR_MS,
  )
  const rateLimitMax = parseInteger(
    'RATE_LIMIT_MAX',
    env.RATE_LIMIT_MAX,
    10,
    1,
    100_000,
  )

  return {
    env: runtimeEnv,
    isProduction,
    host: env.HOST ?? '0.0.0.0',
    port,
    allowedOrigins:
      allowedOrigins.length > 0 ? allowedOrigins : [DEFAULT_ALLOWED_ORIGIN],
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    testDatabaseUrl: env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    jwtSecret,
    cookie: {
      name: env.SESSION_COOKIE_NAME ?? 'brightloop_session',
      secure: cookieSecure,
      sameSite: 'lax',
      maxAgeMs: sessionTtlHours * HOUR_MS,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    },
    authRateLimit: {
      windowMs: rateLimitWindowMs,
      max: rateLimitMax,
    },
  }
}
