import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import { z } from 'zod'
import { createPool, withTransaction } from '../src/lib/db.js'
import { hashPassword, passwordSchema } from '../src/lib/password.js'
import { normalizeEmail } from '../src/lib/text.js'
import { loadConfig } from '../src/config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REFERENCE_SEEDS_DIR = path.join(HERE, 'seeds', 'reference')

export async function runReferenceSeeds(
  pool: Pool,
  seedsDir: string = REFERENCE_SEEDS_DIR,
): Promise<string[]> {
  const files = (await readdir(seedsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = await readFile(path.join(seedsDir, file), 'utf8')
    await withTransaction(pool, async (tx) => {
      await tx.query(sql)
    })
  }

  return files
}

/**
 * D-08: the first Admin comes from environment variables, never the repo.
 * The seed is idempotent and does nothing when the variables are absent.
 */
async function seedAccount(
  pool: Pool,
  env: NodeJS.ProcessEnv,
  roleName: 'admin' | 'staff',
): Promise<boolean> {
  const prefix = roleName.toUpperCase()
  const email = env[`${prefix}_EMAIL`]
  const password = env[`${prefix}_PASSWORD`]
  if (!email && !password) return false
  if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD must both be set`)

  const normalizedEmail = normalizeEmail(email)
  if (!z.string().max(254).email().safeParse(normalizedEmail).success) {
    throw new Error(`${prefix}_EMAIL must be a valid email address`)
  }

  const parsedPassword = passwordSchema.safeParse(password)
  if (!parsedPassword.success) {
    throw new Error(
      `${prefix}_PASSWORD does not meet the password policy: ${parsedPassword.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    )
  }

  if (password.toLowerCase() === normalizedEmail) throw new Error(`${prefix}_PASSWORD must not equal the email address`)
  const fullName = env[`${prefix}_FULL_NAME`]?.trim() || (roleName === 'admin' ? 'Administrator' : 'Staff')
  if (fullName.length > 120) throw new Error(`${prefix}_FULL_NAME must be at most 120 characters`)
  const passwordHash = await hashPassword(password)

  const role = await pool.query<{ id: number }>(
    'SELECT id FROM roles WHERE name = $1',
    [roleName],
  )
  const roleRow = role.rows[0]
  if (!roleRow) {
    throw new Error(`${roleName} role is missing; run the reference seeds first`)
  }

  const result = await pool.query(
    `INSERT INTO users (role_id, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [roleRow.id, normalizedEmail, passwordHash, fullName],
  )

  return result.rowCount === 1
}

export function seedAdmin(pool: Pool, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return seedAccount(pool, env, 'admin')
}

/** Optional first staff account; credentials are supplied by the environment. */
export function seedStaff(pool: Pool, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return seedAccount(pool, env, 'staff')
}

async function main(): Promise<void> {
  await import('dotenv/config')
  const config = loadConfig()
  const pool = createPool(config.databaseUrl)

  try {
    const seeds = await runReferenceSeeds(pool)
    const adminCreated = await seedAdmin(pool, process.env)
    const staffCreated = await seedStaff(pool, process.env)

    console.log(`reference seeds applied: ${seeds.join(', ')}`)
    console.log(
      adminCreated
        ? 'initial admin account created'
        : 'initial admin account not created (already exists or variables unset)',
    )
    console.log(staffCreated ? 'initial staff account created' : 'initial staff account not created (already exists or variables unset)')
  } finally {
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('seed failed', error)
    process.exit(1)
  })
}
