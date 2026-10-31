import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrate.js'

describe('migration selection', () => {
  it('only scopes migrations when explicitly requested and never hides unscoped failures', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'brightloop-migrations-'))
    const baseline = '20261031000000_f00_baseline.sql'
    const plans = '20261108090000_f07_plans.sql'
    const recorded: string[] = []
    const statements: string[] = []
    const client = {
      release() {},
      async query(sql: string, params?: unknown[]) {
        statements.push(sql)
        if (sql === 'BROKEN_F07') throw new Error('Missing F06 prerequisite')
        if (sql.startsWith('INSERT INTO schema_migrations')) recorded.push(String(params?.[0]))
        return { rows: [], rowCount: 0 }
      },
    }
    const pool = { query: client.query, connect: async () => client } as unknown as Pool
    try {
      await writeFile(path.join(directory, baseline), 'BASELINE')
      await writeFile(path.join(directory, plans), 'BROKEN_F07')
      expect(await runMigrations(pool, directory, ['f00'])).toEqual([baseline])
      expect(recorded).toEqual([baseline])
      expect(statements).not.toContain('BROKEN_F07')
      await expect(runMigrations(pool, directory)).rejects.toThrow('Missing F06 prerequisite')
      expect(recorded).not.toContain(plans)
      expect(statements).toContain('ROLLBACK')
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})
