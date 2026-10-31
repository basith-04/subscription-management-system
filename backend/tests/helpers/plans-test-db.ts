// F07 integration-test database fixture.
// Creates an isolated schema in TEST_DATABASE_URL, applies the F07 migration, and points the app's
// pool at it via search_path. F06/F09 tables do not exist in migrations yet, so minimal STAND-INS
// (shape taken from docs/database/database-design.md) are created here — test-only, never migrated.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

const MIGRATION = fileURLToPath(
  new URL('../../db/migrations/20261108090000_f07_plans_and_policies.sql', import.meta.url),
)

const STAND_INS = `
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE product_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  attribute_name TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);`

// Stand-in for F09's subscriptions: only the RESTRICT FK to plans matters for "in use" deletion.
const SUBSCRIPTIONS_STAND_IN = `
CREATE TABLE subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans (id) ON DELETE RESTRICT
);`

export interface PlanTestDb {
  admin: pg.Pool
  schema: string
  teardown(): Promise<void>
  reset(): Promise<void>
}

export async function createPlanTestDb(): Promise<PlanTestDb> {
  const base = TEST_DATABASE_URL!
  const schema = `f07_test_${process.pid}_${Date.now()}`
  const setup = new pg.Client({ connectionString: base })
  await setup.connect()
  await setup.query(`CREATE SCHEMA ${schema}`)
  await setup.query(`SET search_path TO ${schema}`)
  await setup.query(STAND_INS)
  await setup.query(readFileSync(MIGRATION, 'utf8'))
  await setup.query(SUBSCRIPTIONS_STAND_IN)
  await setup.end()

  const url = new URL(base)
  url.searchParams.set('options', `-c search_path=${schema}`)
  process.env.DATABASE_URL = url.toString()
  process.env.DEMO_AUTH_ENABLED = 'true'

  const admin = new pg.Pool({ connectionString: url.toString() })
  return {
    admin,
    schema,
    async reset() {
      await admin.query('TRUNCATE subscriptions, plan_products, plans, product_variants, products RESTART IDENTITY CASCADE')
    },
    async teardown() {
      await admin.end()
      const drop = new pg.Client({ connectionString: base })
      await drop.connect()
      await drop.query(`DROP SCHEMA ${schema} CASCADE`)
      await drop.end()
    },
  }
}
