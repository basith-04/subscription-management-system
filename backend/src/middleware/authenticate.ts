// Session / Token authentication.
// TEMPORARY: while F01 is in progress, this reads X-User-Id / X-User-Role headers
// or Authorization Bearer tokens.
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ApiError } from './error-handler.js'
import type { Role } from './require-role.js'

export type { Role }

export interface AuthenticatedUser {
  id: number | string
  email: string
  fullName: string
  role: Role
  customerId?: number
}

export type AuthenticatedRequestUser = AuthenticatedUser

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

export const authenticate: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  // Check for test/custom auth header or demo role simulation
  const roleHeader = (req.header('x-user-role') || req.headers['x-user-role']) as Role | undefined
  const idHeader = req.header('x-user-id') || (req.headers['x-user-id'] as string | undefined)
  const emailHeader = req.headers['x-user-email'] as string | undefined
  const nameHeader = req.headers['x-user-name'] as string | undefined

  if (roleHeader && (roleHeader === 'admin' || roleHeader === 'staff' || roleHeader === 'customer')) {
    const parsedId = idHeader ? (Number.isNaN(Number(idHeader)) ? idHeader : Number(idHeader)) : 1
    req.user = {
      id: parsedId,
      email: emailHeader ?? `${roleHeader}@brightloop.io`,
      fullName: nameHeader ?? `${roleHeader.toUpperCase()} User`,
      role: roleHeader,
    }
    return next()
  }

  // Check Authorization Bearer header if provided
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    if (token === 'admin-token') {
      req.user = {
        id: 'user_admin',
        email: 'admin@brightloop.io',
        fullName: 'Admin User',
        role: 'admin',
      }
      return next()
    }
    if (token === 'staff-token') {
      req.user = {
        id: 'user_staff',
        email: 'staff@brightloop.io',
        fullName: 'Staff User',
        role: 'staff',
      }
      return next()
    }
    if (token === 'customer-token') {
      req.user = {
        id: 'user_customer',
        email: 'customer@brightloop.io',
        fullName: 'Customer User',
        role: 'customer',
      }
      return next()
    }
  }

  // Not logged in
  return next(new ApiError(401, 'UNAUTHORIZED', 'Not logged in'))
}
