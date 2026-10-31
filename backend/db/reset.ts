import { createPool } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'
import { runMigrations } from './migrate.js'
import { runReferenceSeeds, seedAdmin, seedStaff } from './seed.js'

/**
 * Destructive development helper. Never run against a shared or production
 * database; it drops every table owned by this application.
 */
async function main(): Promise<void> {
  await import('dotenv/config')
  const config = loadConfig()

  if (config.isProduction) {
    throw new Error('db:reset is not allowed when APP_ENV=production')
  }

  const pool = createPool(config.databaseUrl)

  try {
    await pool.query(`
      DROP TABLE IF EXISTS
        audit_logs,
        customers,
        users,
        roles,
        schema_migrations
      CASCADE
    `)
    await runMigrations(pool)
    await runReferenceSeeds(pool)
    await seedAdmin(pool, process.env)
    await seedStaff(pool, process.env)
    console.log('database reset complete')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error('reset failed', error)
  process.exit(1)
})
