import type { Config } from '../../config.js'
import type { AuthUser } from '../../lib/auth-user.js'
import { mapDbError } from '../../lib/db.js'
import { ApiError } from '../../lib/errors.js'
import { ERROR_CODES } from '../../lib/error-codes.js'
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../../lib/password.js'
import { signSessionToken } from '../../lib/session.js'
import { normalizeEmail } from '../../lib/text.js'
import type { AuthRepository, UserRecord } from './auth.repository.js'
import type { LoginInput, RegisterInput } from './auth.schemas.js'

export interface SafeUser {
  id: number
  email: string
  full_name: string
  role: string
  customer_id: number | null
}

export interface RequestMeta {
  ipAddress?: string | null
}

export interface RegisterResult {
  token: string
  user: {
    id: number
    email: string
    full_name: string
    role: string
  }
  customer_id: number
  warnings?: Array<{ field: string; message: string }>
}

export interface LoginResult {
  token: string
  user: SafeUser
}

export interface AuthService {
  register(input: RegisterInput, meta?: RequestMeta): Promise<RegisterResult>
  login(input: LoginInput, meta?: RequestMeta): Promise<LoginResult>
  getMe(user: AuthUser): SafeUser
  logout(user: AuthUser, meta?: RequestMeta): Promise<void>
}

export interface AuthServiceDependencies {
  repo: AuthRepository
  config: Config
  hash?: (password: string) => Promise<string>
  verify?: (passwordHash: string, password: string) => Promise<boolean>
  verifyDummy?: (password: string) => Promise<void>
}

function invalidCredentials(): ApiError {
  return new ApiError(
    401,
    ERROR_CODES.INVALID_CREDENTIALS,
    'Invalid email or password',
  )
}

function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    customer_id: user.customer_id,
  }
}

export function createAuthService({
  repo,
  config,
  hash = hashPassword,
  verify = verifyPassword,
  verifyDummy = verifyDummyPassword,
}: AuthServiceDependencies): AuthService {
  return {
    async register(input, meta = {}) {
      const email = normalizeEmail(input.email)
      const fullName = input.full_name.trim()
      const passwordHash = await hash(input.password)

      try {
        const created = await repo.transaction(async (tx) => {
          const role = await repo.findRoleByName(tx, 'customer')
          if (!role) {
            throw new ApiError(
              500,
              ERROR_CODES.INTERNAL_ERROR,
              'Customer registration is not configured',
            )
          }

          const duplicateCustomerEmail = await repo.customerEmailExists(tx, email)
          const user = await repo.insertUser(tx, {
            role_id: role.id,
            email,
            password_hash: passwordHash,
            full_name: fullName,
          })

          const customer = await repo.insertCustomer(tx, {
            user_id: user.id,
            name: fullName,
            email,
            company_name: input.company_name ?? null,
            phone: input.phone ?? null,
          })

          await repo.insertAuditLog(tx, {
            actorUserId: user.id,
            action: 'user.register',
            entityType: 'user',
            entityId: user.id,
            newValues: { email, role: 'customer' },
            ipAddress: meta.ipAddress ?? null,
          })

          return { user, customer, duplicateCustomerEmail }
        })

        const token = await signSessionToken(
          { user_id: created.user.id, role: 'customer' },
          config,
        )

        return {
          token,
          user: {
            id: created.user.id,
            email: created.user.email,
            full_name: created.user.full_name,
            role: 'customer',
          },
          customer_id: created.customer.id,
          ...(created.duplicateCustomerEmail ? { warnings: [{ field: 'email', message: 'Another customer record uses this email. It was not linked to your account.' }] } : {}),
        }
      } catch (error) {
        mapDbError(error)
      }
    },

    async login(input, meta = {}) {
      const email = normalizeEmail(input.email)
      const user = await repo.transaction((tx) =>
        repo.findUserByEmail(tx, email),
      )

      if (!user) {
        await verifyDummy(input.password)
        throw invalidCredentials()
      }

      const passwordMatches = await verify(
        user.password_hash,
        input.password,
      )
      if (!passwordMatches) {
        throw invalidCredentials()
      }

      if (!user.is_active) {
        throw new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'This account is disabled. Contact an administrator.',
        )
      }

      await repo.transaction(async (tx) => {
        await repo.updateLastLogin(tx, user.id)
        await repo.insertAuditLog(tx, {
          actorUserId: user.id,
          action: 'user.login',
          entityType: 'user',
          entityId: user.id,
          newValues: { email: user.email, role: user.role },
          ipAddress: meta.ipAddress ?? null,
        })
      })

      const token = await signSessionToken(
        { user_id: user.id, role: user.role },
        config,
      )

      return { token, user: toSafeUser(user) }
    },

    getMe(user) {
      if (user.role === 'customer' && user.customer_id === null) {
        throw new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'Your customer profile is missing. Contact an administrator.',
        )
      }

      return { ...user }
    },

    async logout(user, meta = {}) {
      try {
        await repo.transaction((tx) =>
          repo.insertAuditLog(tx, {
            actorUserId: user.id,
            action: 'user.logout',
            entityType: 'user',
            entityId: user.id,
            newValues: { email: user.email, role: user.role },
            ipAddress: meta.ipAddress ?? null,
          }),
        )
      } catch {
        // Clearing the browser cookie must still succeed if auditing fails.
        console.warn('[auth] logout audit could not be written')
      }
    },
  }
}
