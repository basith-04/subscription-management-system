export interface Config {
  env: string
  host: string
  port: number
  allowedOrigins: string[]
}

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:5173'

/**
 * Read configuration from the process environment.
 * Every value has a safe default for local development.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawPort = env.PORT ?? '4000'
  const port = Number.parseInt(rawPort, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`)
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    env: env.APP_ENV ?? env.NODE_ENV ?? 'development',
    host: env.HOST ?? '0.0.0.0',
    port,
    allowedOrigins:
      allowedOrigins.length > 0 ? allowedOrigins : [DEFAULT_ALLOWED_ORIGIN],
  }
}
