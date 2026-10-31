import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import { createPool, withTransaction } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, 'migrations')
const MIGRATION_LOCK = 7_010_001

// Feature prerequisites are not encoded reliably by historical timestamp names
// (F07, for example, depends on F06). Keep the runner deterministic while
// respecting the documented dependency graph on an empty database.
const FEATURE_ORDER: Record<string, number> = {
  f00: 0,
  f02: 1,
  f05: 2,
  f06: 3,
  f07: 4,
  f08: 5,
  f09: 6,
  f11: 7,
  f12: 8,
  f13: 9,
  f15: 10,
}

function migrationOrder(file: string): [number, string] {
  const feature = /^\d{14}_(f\d{2})_/.exec(file)?.[1]
  return [feature ? (FEATURE_ORDER[feature] ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER, file]
}

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
  features?: readonly string[],
): Promise<string[]> {
  await ensureMigrationTable(pool)

  const lockClient = await pool.connect()
  const applied: string[] = []

  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .filter((file) => !features || features.includes(/^\d{14}_(f\d{2})_/.exec(file)?.[1] ?? ''))
      .sort((left, right) => {
        const [leftOrder, leftName] = migrationOrder(left)
        const [rightOrder, rightName] = migrationOrder(right)
        return leftOrder - rightOrder || leftName.localeCompare(rightName)
      })

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
  await import('dotenv/config')
  const config = loadConfig()
  const featureArg = process.argv.slice(2).find((arg) => arg.startsWith('--features='))
  const features = featureArg?.slice('--features='.length).split(',')
  if (features && !features.every((feature) => /^f\d{2}$/.test(feature))) {
    throw new Error('Expected --features=f00,f07 (feature identifiers only)')
  }
  const pool = createPool(config.databaseUrl)

  try {
    const applied = await runMigrations(pool, undefined, features)
    if (features) console.log(`migration scope: ${features.join(', ')} (other features are not applied)`)
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
