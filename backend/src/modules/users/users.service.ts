import { ApiError } from '../../middleware/error-handler.js'
import { withTransaction, isPgError } from '../../lib/db.js'
import { parsePagination, buildMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/responses.js'
import * as repo from './users.repository.js'
import type { CreateStaffInput, UpdateUserInput, ListUsersQuery } from './users.schemas.js'

// MOCK HASHING: In F01, this will be `argon2.hash(password)`.
function fakeHash(pw: string): string { return `mock_hash_${pw}` }

export async function list(query: ListUsersQuery): Promise<{ data: repo.UserRow[]; meta: PageMeta }> {
  const p = parsePagination(query as Record<string, unknown>)
  const isActive = query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined
  const { rows, total } = await repo.listUsers({ ...query, is_active: isActive, limit: p.limit, offset: p.offset })
  return { data: rows, meta: buildMeta(total, p.page, p.page_size) }
}

export async function get(id: number): Promise<repo.UserRow> {
  const user = await repo.findUserById(id)
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found')
  return user
}

export async function createStaff(actorId: number, input: CreateStaffInput): Promise<repo.UserRow> {
  try {
    return await repo.insertStaff({
      full_name: input.full_name,
      email: input.email,
      password_hash: fakeHash(input.password),
      created_by: actorId,
    })
  } catch (error) {
    if (isPgError(error) && error.code === '23505') {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'A user with this email already exists')
    }
    throw error
  }
}

export async function update(actorId: number, id: number, input: UpdateUserInput): Promise<repo.UserRow> {
  if (id === actorId && input.is_active === false) {
    throw new ApiError(409, 'CONFLICT', 'You cannot deactivate your own account')
  }

  return await withTransaction(async (tx) => {
    if (input.is_active === false) {
      const target = await repo.findUserById(id)
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found')
      
      if (target.role === 'admin') {
        const remaining = await repo.countActiveAdmins(tx, id)
        if (remaining === 0) {
          throw new ApiError(409, 'CONFLICT', 'Cannot deactivate the last active Admin')
        }
      }
    }

    const updated = await repo.updateUser(id, input)
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'User not found')
    return updated
  })
}
