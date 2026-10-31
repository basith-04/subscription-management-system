import type { RequestHandler } from 'express'
import { ApiError } from './error-handler.js'
import { hasPermission, type Permission, type Role } from '../config/permissions.js'

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required'))
      return
    }

    if (!hasPermission(req.user.role as Role, permission)) {
      next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'))
      return
    }

    next()
  }
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required'))
      return
    }

    if (!roles.includes(req.user.role as Role)) {
      next(new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'))
      return
    }

    next()
  }
}
