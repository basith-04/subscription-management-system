import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { transition } from '../../../src/lib/state-machine.js'

const databaseUrl = process.env.TEST_DATABASE_URL

// The temporary tables are test-only stand-ins; no application schema is created.
describe.skipIf(!databaseUrl)('transition transaction behavior', () => {
  let pool: Pool
  let client: PoolClient

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 })
    client = await pool.connect()
    await client.query(`
      CREATE TEMP TABLE subscriptions (
        id BIGINT PRIMARY KEY, status TEXT NOT NULL, updated_at TIMESTAMPTZ,
        quotation_valid_until DATE, confirmed_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ, closed_reason TEXT
      );
      CREATE TEMP TABLE audit_logs (
        actor_user_id BIGINT, action TEXT NOT NULL CHECK (action <> 'fail'),
        entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
        old_values JSONB, new_values JSONB, ip_address INET
      );
    `)
  })

  beforeEach(async () => {
    await client.query('TRUNCATE pg_temp.audit_logs, pg_temp.subscriptions')
    await client.query("INSERT INTO pg_temp.subscriptions (id, status) VALUES (1, 'draft')")
  })

  afterAll(async () => {
    client?.release()
    await pool?.end()
  })

  it('commits the conditional transition and audit together', async () => {
    await client.query('BEGIN')
    await transition({ tx: client, entity: 'subscriptions', id: 1, from: ['draft'], to: 'quotation', actorUserId: 4, action: 'subscription.issue', reason: 'Ready', fields: { quotation_valid_until: '2026-11-01' } })
    await client.query('COMMIT')
    const row = await client.query("SELECT status, quotation_valid_until::text FROM pg_temp.subscriptions WHERE id = 1")
    const audit = await client.query('SELECT action, old_values, new_values FROM pg_temp.audit_logs')
    expect(row.rows[0]).toMatchObject({ status: 'quotation', quotation_valid_until: '2026-11-01' })
    expect(audit.rows[0]).toMatchObject({ action: 'subscription.issue', old_values: { status: 'draft' }, new_values: { status: 'quotation', reason: 'Ready' } })
  })

  it('rolls back the state update when the audit insert fails', async () => {
    await client.query('BEGIN')
    try {
      await expect(transition({ tx: client, entity: 'subscriptions', id: 1, from: ['draft'], to: 'quotation', actorUserId: 4, action: 'fail', fields: { quotation_valid_until: '2026-11-01' } })).rejects.toThrow()
    } finally {
      await client.query('ROLLBACK')
    }
    const row = await client.query('SELECT status FROM pg_temp.subscriptions WHERE id = 1')
    const audit = await client.query('SELECT count(*)::int AS count FROM pg_temp.audit_logs')
    expect(row.rows[0]?.status).toBe('draft')
    expect(audit.rows[0]?.count).toBe(0)
  })
})
