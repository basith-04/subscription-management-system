import type { Request, Response, NextFunction } from 'express'
import type { Role } from '../config/permissions.js'

export interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  role: Role
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Check for test/custom auth header or basic role simulation
  const roleHeader = req.headers['x-user-role'] as Role | undefined
  const idHeader = req.headers['x-user-id'] as string | undefined
  const emailHeader = req.headers['x-user-email'] as string | undefined
  const nameHeader = req.headers['x-user-name'] as string | undefined

  if (roleHeader && (roleHeader === 'admin' || roleHeader === 'staff' || roleHeader === 'customer')) {
    req.user = {
      id: idHeader ?? 'user_1',
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

  // Anonymous request
  req.user = undefined
  next()
}
