export type Role = 'admin' | 'staff' | 'customer'

export type Permission =
  | 'taxes:read'
  | 'taxes:manage'
  | 'payment_terms:read'
  | 'payment_terms:manage'

export const rolePermissions: Record<Role, readonly Permission[]> = {
  admin: [
    'taxes:read',
    'taxes:manage',
    'payment_terms:read',
    'payment_terms:manage',
  ],
  staff: [
    'taxes:read',
    'payment_terms:read',
  ],
  customer: [],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = rolePermissions[role]
  return permissions ? permissions.includes(permission) : false
}
