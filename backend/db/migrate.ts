import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import { createPool, withTransaction } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, 'migrations')
const MIGRATION_LOCK = 7_010_001

async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

/**
 * Apply every pending SQL migration in filename order. Forward-only: applied
 * files are recorded and never edited.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  await ensureMigrationTable(pool)

  const lockClient = await pool.connect()
  const applied: string[] = []

  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const existing = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file],
      )
      if (existing.rowCount && existing.rowCount > 0) continue

      const sql = await readFile(path.join(migrationsDir, file), 'utf8')
      await withTransaction(pool, async (tx) => {
        await tx.query(sql)
        await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          file,
        ])
      })
      applied.push(file)
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
    lockClient.release()
  }

  return applied
}

async function main(): Promise<void> {
  const config = loadConfig()
  const pool = createPool(config.databaseUrl)

  try {
    const applied = await runMigrations(pool)
    if (applied.length === 0) {
      console.log('database is up to date')
    } else {
      console.log(`applied migrations: ${applied.join(', ')}`)
    }
  } finally {
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('migration failed', error)
    process.exit(1)
  })
}
