import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { loadConfig } from '../config.js'
import { ApiError } from './errors.js'
import { ERROR_CODES } from './error-codes.js'

export type Queryable = Pool | PoolClient
export type Tx = PoolClient

let sharedPool: Pool | undefined
let sharedDatabaseUrl: string | undefined

/** Shared pool for modules that use the F00 query/transaction helpers. */
export function getSharedPool(databaseUrl?: string): Pool {
  const url = databaseUrl ?? (sharedDatabaseUrl || loadConfig().databaseUrl)
  if (sharedPool && sharedDatabaseUrl !== url) {
    throw new Error('Shared database pool is already configured for another database')
  }
  if (!sharedPool) {
    sharedPool = createPool(url)
    sharedDatabaseUrl = url
  }
  return sharedPool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getSharedPool().query<T>(text, params)
}

export async function closePool(): Promise<void> {
  const pool = sharedPool
  sharedPool = undefined
  sharedDatabaseUrl = undefined
  if (pool) await pool.end()
}

export interface PgError extends Error {
  code: string
  constraint?: string
  detail?: string
}

export function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null &&
    'code' in error && typeof error.code === 'string'
}

interface PostgresError {
  code?: string
  constraint?: string
  detail?: string
}

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}

/**
 * Run a callback inside a single database transaction. The callback receives a
 * client that must be used for every statement in the transaction.
 */
export function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T>
export function withTransaction<T>(
  pool: Pool,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T>
export async function withTransaction<T>(
  poolOrFn: Pool | ((tx: PoolClient) => Promise<T>),
  callback?: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = typeof poolOrFn === 'function' ? getSharedPool() : poolOrFn
  const fn = typeof poolOrFn === 'function' ? poolOrFn : callback
  if (!fn) throw new Error('Transaction callback is required')
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original error; rollback failures are secondary.
    }
    throw error
  } finally {
    client.release()
  }
}

/**
 * Translate Postgres integrity errors into the API contract once, so no other
 * layer needs to inspect SQLSTATE values or expose constraint names.
 */
export function mapDbError(error: unknown): never {
  if (error instanceof ApiError) throw error

  const pgError = error as PostgresError
  const constraint = pgError.constraint ?? ''

  if (pgError.code === '23505') {
    if (constraint.includes('users_email')) {
      throw new ApiError(
        409,
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
      )
    }

    throw new ApiError(
      409,
      ERROR_CODES.CONFLICT,
      'A record with these details already exists',
    )
  }

  if (pgError.code === '23503') {
    throw new ApiError(
      409,
      ERROR_CODES.IN_USE,
      'This record is still referenced by other data',
    )
  }

  if (pgError.code === '23514' || pgError.code === '22P02') {
    throw new ApiError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      'The supplied value is not valid',
    )
  }

  throw error
}
