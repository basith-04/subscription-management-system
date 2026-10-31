import type { Request, RequestHandler } from 'express'
import { ApiError } from '../lib/errors.js'
import { ERROR_CODES } from '../lib/error-codes.js'
import { requireRole } from './require-role.js'

/** F01 permissions; future business permissions must follow the RBAC matrix. */
export const PERMISSIONS = {
  'auth:self': ['admin', 'staff', 'customer'],
  'backoffice:access': ['admin', 'staff'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function requirePermission(permission: Permission): RequestHandler {
  return requireRole(...PERMISSIONS[permission])
}

/** Derive customer scope only from the authenticated database-backed identity. */
export function scopeToCustomer(req: Request): number {
  if (!req.user) throw new ApiError(401, ERROR_CODES.UNAUTHENTICATED, 'Authentication required')
  if (req.user.role !== 'customer' || !Number.isSafeInteger(req.user.customer_id) || (req.user.customer_id ?? 0) <= 0) {
    throw new ApiError(403, ERROR_CODES.FORBIDDEN, 'Customer profile required')
  }
  return req.user.customer_id as number
}
