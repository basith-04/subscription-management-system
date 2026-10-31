// F09 integration-test database: an isolated schema in TEST_DATABASE_URL with the REAL migrations applied in
// dependency order: F00 + F05 + F06, then F07 (its migration sorts before F06's, so it is applied in a second
// stage), then F09 + F11 (+ their idempotent FK follow-ups). Only `quotation_templates` / `quotation_template_items`
// are TEST STAND-INS with the documented shape (docs/database/database-design.md §4.4): F08 has not merged its
// migration. They are created before F09's FK follow-up runs so the template FK is attached for real.
import pg from 'pg'
import { runMigrations } from '../../db/migrate.js'
import { runReferenceSeeds } from '../../db/seed.js'
import { testDatabaseUrl } from './db.js'

const TEMPLATE_STAND_INS = `
CREATE TABLE quotation_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  plan_id BIGINT NOT NULL REFERENCES plans (id),
  validity_days INT NOT NULL CHECK (validity_days > 0),
  payment_term_id SMALLINT REFERENCES payment_terms (id),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE quotation_template_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES quotation_templates (id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products (id),
  variant_id BIGINT REFERENCES product_variants (id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_override NUMERIC(12,2),
  tax_rule_id BIGINT REFERENCES tax_rules (id),
  sort_order INT NOT NULL DEFAULT 0
);`

export interface SubscriptionTestDb {
  pool: pg.Pool
  schema: string
  reset(): Promise<void>
  teardown(): Promise<void>
}

export async function createSubscriptionTestDb(opts: { withTemplates?: boolean } = {}): Promise<SubscriptionTestDb> {
  const withTemplates = opts.withTemplates ?? true
  const base = testDatabaseUrl()
  const schema = `f09_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const setup = new pg.Client({ connectionString: base })
  await setup.connect()
  await setup.query('CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public')
  await setup.query(`CREATE SCHEMA ${schema}`)
  await setup.end()

  const url = new URL(base)
  url.searchParams.set('options', `-c search_path=${schema},public`)
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10 })
  const fixture: SubscriptionTestDb = {
    pool, schema,
    async reset() {
      const tables = ['payment_allocations', 'payments', 'invoice_tax_details', 'invoice_items', 'invoices', 'billing_runs',
        'subscription_items', 'subscriptions', ...(withTemplates ? ['quotation_template_items', 'quotation_templates'] : []),
        'plan_products', 'plans', 'product_variants', 'products', 'audit_logs', 'customers', 'users']
      await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
      await pool.query('ALTER SEQUENCE subscription_number_seq RESTART WITH 1')
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
    await pool.query(`CREATE TABLE ${schema}.schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    await runMigrations(pool, undefined, ['f00', 'f05', 'f06'])
    await runMigrations(pool, undefined, ['f07'])
    if (withTemplates) await pool.query(TEMPLATE_STAND_INS)
    await runMigrations(pool, undefined, ['f09', 'f11', 'f13'])
    await runReferenceSeeds(pool)
  } catch (error) {
    await fixture.teardown()
    throw error
  }
  return fixture
}
