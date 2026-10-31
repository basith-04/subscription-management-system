import { randomBytes } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transition } from '../../../src/lib/state-machine.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const schema = `f09_transition_test_${randomBytes(12).toString('hex')}`

// These isolated stand-ins test locking only, not the future F09 migration.
describe.skipIf(!databaseUrl)('concurrent conditional transitions', () => {
  let pool: Pool
  let created = false

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 3 })
    await pool.query(`CREATE SCHEMA ${schema}`)
    created = true
    await pool.query(`
      CREATE TABLE ${schema}.subscriptions (
        id BIGINT PRIMARY KEY, status TEXT NOT NULL, updated_at TIMESTAMPTZ
      );
      CREATE TABLE ${schema}.audit_logs (
        actor_user_id BIGINT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id BIGINT NOT NULL, old_values JSONB, new_values JSONB, ip_address INET
      );
      INSERT INTO ${schema}.subscriptions (id, status) VALUES (1, 'draft');
    `)
  })

  afterAll(async () => {
    if (created) await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool?.end()
  })

  async function attempt(client: PoolClient): Promise<number> {
    await client.query(`SET search_path TO ${schema}`)
    await client.query('BEGIN')
    try {
      await transition({ tx: client, entity: 'subscriptions', id: 1, from: ['draft'], to: 'quotation', actorUserId: 1, action: 'subscription.issue' })
      await client.query('COMMIT')
      return 200
    } catch (error) {
      await client.query('ROLLBACK')
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) return 409
      throw error
    } finally {
      client.release()
    }
  }

  it('commits exactly one state change and one audit for two simultaneous requests', async () => {
    const first = await pool.connect()
    const second = await pool.connect()
    const statuses = await Promise.all([attempt(first), attempt(second)])
    expect(statuses.sort()).toEqual([200, 409])
    const result = await pool.query<{ status: string; count: number }>(
      `SELECT s.status, (SELECT count(*)::int FROM ${schema}.audit_logs) AS count FROM ${schema}.subscriptions s WHERE s.id = 1`,
    )
    expect(result.rows[0]).toEqual({ status: 'quotation', count: 1 })
  })
})
