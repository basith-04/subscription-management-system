import { Pool } from 'pg'
import { runMigrations } from '../../db/migrate.js'
import { runReferenceSeeds } from '../../db/seed.js'
import { loadConfig } from '../../src/config.js'

export const TEST_JWT_SECRET =
  'test-secret-that-is-at-least-32-characters-long'

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ?? loadConfig().testDatabaseUrl
  )
}

export function createTestPool(): Pool {
  return new Pool({
    connectionString: testDatabaseUrl(),
    max: 5,
    connectionTimeoutMillis: 2_000,
  })
}

export async function canConnect(): Promise<boolean> {
  const pool = createTestPool()

  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await pool.end()
  }
}

export async function prepareDatabase(pool: Pool): Promise<void> {
  // F01 owns no schema beyond the F00 baseline. F07 is tested in its own schema.
  await runMigrations(pool, undefined, ['f00'])
  await runReferenceSeeds(pool)
}

export async function resetData(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE audit_logs, customers, users RESTART IDENTITY CASCADE',
  )
}
