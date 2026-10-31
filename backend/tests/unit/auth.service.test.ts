import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../../src/lib/audit.js'
import type { Queryable } from '../../src/lib/db.js'
import { loadConfig } from '../../src/config.js'
import type {
  AuthRepository,
  InsertCustomerInput,
  InsertUserInput,
  RoleRecord,
  UserRecord,
} from '../../src/modules/auth/auth.repository.js'
import { createAuthService } from '../../src/modules/auth/auth.service.js'

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long'

interface FakeState {
  role: RoleRecord | null
  users: UserRecord[]
  customers: InsertCustomerInput[]
  audits: AuditEntry[]
  nextUserId: number
  nextCustomerId: number
  lastLoginUserId: number | null
  dummyCalls: number
  failUserInsert?: { code: string; constraint?: string }
  failCustomerInsert?: { code: string }
}

function createFakeRepository() {
  const state: FakeState = {
    role: { id: 3, name: 'customer' },
    users: [],
    customers: [],
    audits: [],
    nextUserId: 1,
    nextCustomerId: 1,
    lastLoginUserId: null,
    dummyCalls: 0,
  }

  const repo: AuthRepository = {
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const snapshot = structuredClone(state)
      try {
        return await fn({} as Queryable)
      } catch (error) {
        Object.assign(state, snapshot)
        throw error
      }
    },

    async findRoleByName(_tx, name) {
      return state.role?.name === name ? state.role : null
    },

    async findUserByEmail(_tx, email) {
      return state.users.find((user) => user.email === email) ?? null
    },

    async findUserById(_tx, id) {
      return state.users.find((user) => user.id === id) ?? null
    },

    async insertUser(_tx, input: InsertUserInput) {
      if (state.failUserInsert) {
        throw Object.assign(new Error('forced user failure'), state.failUserInsert)
      }

      const user: UserRecord = {
        id: state.nextUserId++,
        email: input.email,
        password_hash: input.password_hash,
        full_name: input.full_name,
        is_active: true,
        role_id: input.role_id,
        role: state.role?.name ?? 'customer',
        customer_id: null,
      }
      state.users.push(user)

      return {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      }
    },

    async insertCustomer(_tx, input: InsertCustomerInput) {
      if (state.failCustomerInsert) {
        throw Object.assign(
          new Error('forced customer failure'),
          state.failCustomerInsert,
        )
      }

      state.customers.push(input)
      const customerId = state.nextCustomerId++
      const user = state.users.find((entry) => entry.id === input.user_id)
      if (user) user.customer_id = customerId

      return { id: customerId }
    },

    async updateLastLogin(_tx, userId) {
      state.lastLoginUserId = userId
    },

    async insertAuditLog(_tx, entry) {
      state.audits.push(entry)
    },
  }

  return { repo, state }
}

function createService(repo: AuthRepository, state: FakeState) {
  return createAuthService({
    repo,
    config: loadConfig({ JWT_SECRET: TEST_SECRET } as NodeJS.ProcessEnv),
    hash: async (password) => `hashed:${password}`,
    verify: async (passwordHash, password) =>
      passwordHash === `hashed:${password}`,
    verifyDummy: async () => {
      state.dummyCalls += 1
    },
  })
}

const registration = {
  full_name: 'Example Customer',
  email: 'customer@example.com',
  password: 'Example!Pass123',
  company_name: 'Example Company',
  phone: '+91 9876543210',
}

describe('auth service registration', () => {
  it('creates a customer user, linked profile and audit row in one transaction', async () => {
    const { repo, state } = createFakeRepository()
    const service = createService(repo, state)

    const result = await service.register(registration)

    expect(result.user).toMatchObject({
      email: 'customer@example.com',
      full_name: 'Example Customer',
      role: 'customer',
    })
    expect(result.customer_id).toBe(1)
    expect(result.token).toBeTypeOf('string')
    expect(state.users).toHaveLength(1)
    expect(state.users[0]?.role_id).toBe(3)
    expect(state.users[0]?.password_hash).toBe('hashed:Example!Pass123')
    expect(state.customers).toHaveLength(1)
    expect(state.customers[0]?.user_id).toBe(1)
    expect(state.audits[0]?.action).toBe('user.register')
    expect(JSON.stringify(state.audits)).not.toContain('Example!Pass123')
  })

  it('maps a unique email violation to 409 EMAIL_ALREADY_EXISTS', async () => {
    const { repo, state } = createFakeRepository()
    state.failUserInsert = { code: '23505', constraint: 'uq_users_email' }
    const service = createService(repo, state)

    await expect(service.register(registration)).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_EXISTS',
    })
  })

  it('rolls back the user when the customer insert fails', async () => {
    const { repo, state } = createFakeRepository()
    state.failCustomerInsert = { code: '23514' }
    const service = createService(repo, state)

    await expect(service.register(registration)).rejects.toMatchObject({
      status: 422,
    })
    expect(state.users).toHaveLength(0)
    expect(state.customers).toHaveLength(0)
  })

  it('fails safely when the customer role seed is missing', async () => {
    const { repo, state } = createFakeRepository()
    state.role = null
    const service = createService(repo, state)

    await expect(service.register(registration)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    })
    expect(state.users).toHaveLength(0)
  })
})

describe('auth service login', () => {
  function addUser(state: FakeState, overrides: Partial<UserRecord> = {}) {
    const user: UserRecord = {
      id: 5,
      email: 'customer@example.com',
      password_hash: 'hashed:Example!Pass123',
      full_name: 'Example Customer',
      is_active: true,
      role_id: 3,
      role: 'customer',
      customer_id: 9,
      ...overrides,
    }
    state.users.push(user)
    return user
  }

  it('verifies credentials, updates last_login_at and writes an audit row', async () => {
    const { repo, state } = createFakeRepository()
    addUser(state)
    const service = createService(repo, state)

    const result = await service.login({
      email: 'customer@example.com',
      password: 'Example!Pass123',
    })

    expect(result.user).toMatchObject({
      id: 5,
      role: 'customer',
      customer_id: 9,
    })
    expect(result.token).toBeTypeOf('string')
    expect(state.lastLoginUserId).toBe(5)
    expect(state.audits[0]?.action).toBe('user.login')
  })

  it('returns the same error for a wrong password and an unknown email', async () => {
    const { repo, state } = createFakeRepository()
    addUser(state)
    const service = createService(repo, state)

    const wrongPassword = await service
      .login({ email: 'customer@example.com', password: 'Wrong!Pass123' })
      .catch((error: unknown) => error)
    const unknownEmail = await service
      .login({ email: 'nobody@example.com', password: 'Wrong!Pass123' })
      .catch((error: unknown) => error)

    expect(wrongPassword).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })
    expect(unknownEmail).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: (wrongPassword as Error).message,
    })
    expect(state.dummyCalls).toBe(1)
    expect(state.lastLoginUserId).toBeNull()
  })

  it('rejects an inactive account with 403', async () => {
    const { repo, state } = createFakeRepository()
    addUser(state, { is_active: false })
    const service = createService(repo, state)

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'Example!Pass123',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(state.lastLoginUserId).toBeNull()
  })
})

describe('auth service getMe', () => {
  it('returns the safe identity for a customer with a profile', () => {
    const { repo, state } = createFakeRepository()
    const service = createService(repo, state)

    expect(
      service.getMe({
        id: 1,
        email: 'customer@example.com',
        full_name: 'Example Customer',
        role: 'customer',
        customer_id: 4,
      }),
    ).toEqual({
      id: 1,
      email: 'customer@example.com',
      full_name: 'Example Customer',
      role: 'customer',
      customer_id: 4,
    })
  })

  it('rejects a customer without a linked profile with 403', () => {
    const { repo, state } = createFakeRepository()
    const service = createService(repo, state)

    expect(() =>
      service.getMe({
        id: 1,
        email: 'customer@example.com',
        full_name: 'Example Customer',
        role: 'customer',
        customer_id: null,
      }),
    ).toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    )
  })

  it('allows an admin without a customer profile', () => {
    const { repo, state } = createFakeRepository()
    const service = createService(repo, state)

    expect(
      service.getMe({
        id: 2,
        email: 'admin@example.com',
        full_name: 'Admin',
        role: 'admin',
        customer_id: null,
      }).role,
    ).toBe('admin')
  })
})
