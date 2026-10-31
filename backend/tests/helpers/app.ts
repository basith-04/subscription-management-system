import type { Express } from 'express'
import type { Pool } from 'pg'
import { createApp } from '../../src/app.js'
import { loadConfig } from '../../src/config.js'
import { TEST_JWT_SECRET, testDatabaseUrl } from './db.js'

export function createTestApp(
  pool: Pool,
  overrides: Record<string, string> = {},
): Express {
  const config = loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    TEST_DATABASE_URL: testDatabaseUrl(),
    JWT_SECRET: TEST_JWT_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:5173',
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_WINDOW_MS: '60000',
    ...overrides,
  } as NodeJS.ProcessEnv)

  return createApp(config, { pool })
}
