// F11 integration-test database fixture.
// Creates an isolated schema in TEST_DATABASE_URL and applies the REAL migrations:
//   F00 baseline → F05 tax/terms (reference seeds need them) → F06 products → (test-only F09 stand-ins) → F11 invoices + F11 FK migration.
// F09's `subscriptions` / `subscription_items` are not migrated on main yet, so minimal STAND-INS with the
// documented shape (docs/database/database-design.md §4.5) are created here. They exist only in the throw-away
// schema and are never migrated. Because they exist before the F11 FK migration runs, that migration's
// "attach FK when the F09 table exists" path is exercised for real.
import pg from 'pg'
import { runMigrations } from '../../db/migrate.js'
import { runReferenceSeeds } from '../../db/seed.js'
import { testDatabaseUrl } from './db.js'

const SUBSCRIPTION_STAND_INS = `
CREATE TABLE subscriptions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number      TEXT   NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  status      TEXT   NOT NULL DEFAULT 'active'
);
CREATE TABLE subscription_items (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE
);`

export interface InvoiceTestDb {
  pool: pg.Pool
  schema: string
  reset(): Promise<void>
  teardown(): Promise<void>
}

export async function createInvoiceTestDb(): Promise<InvoiceTestDb> {
  const base = testDatabaseUrl()
  const schema = `f11_test_${process.pid}_${Date.now()}`

  const setup = new pg.Client({ connectionString: base })
  await setup.connect()
  await setup.query('CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public')
  await setup.query(`CREATE SCHEMA ${schema}`)
  await setup.end()

  const url = new URL(base)
  url.searchParams.set('options', `-c search_path=${schema},public`)
  const pool = new pg.Pool({ connectionString: url.toString(), max: 8 })
  await pool.query(
    `CREATE TABLE ${schema}.schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  )

  const fixture: InvoiceTestDb = {
    pool,
    schema,
    async reset() {
      await pool.query(
        `TRUNCATE invoice_tax_details, invoice_items, invoices, billing_runs, subscription_items, subscriptions,
                  audit_logs, customers, users RESTART IDENTITY CASCADE`,
      )
      await pool.query('ALTER SEQUENCE invoice_number_seq RESTART WITH 1')
    },
    async teardown() {
      await pool.end()
      const drop = new pg.Client({ connectionString: base })
      await drop.connect()
      await drop.query(`DROP SCHEMA ${schema} CASCADE`)
      await drop.end()
    },
  }

  try {
    await runMigrations(pool, undefined, ['f00', 'f05', 'f06'])
    await pool.query(SUBSCRIPTION_STAND_INS)
    await runMigrations(pool, undefined, ['f11'])
    await runReferenceSeeds(pool)
  } catch (error) {
    await fixture.teardown() // never leak the throw-away schema when setup fails
    throw error
  }
  return fixture
}