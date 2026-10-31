export type Role = 'admin' | 'staff' | 'customer'

export type Permission =
  | 'taxes:read'
  | 'taxes:manage'
  | 'payment_terms:read'
  | 'payment_terms:manage'
  | 'billing:run'
  | 'billing:view'
  | 'invoices:read'
  | 'invoices:manage'

export const rolePermissions: Record<Role, readonly Permission[]> = {
  admin: [
    'taxes:read',
    'taxes:manage',
    'payment_terms:read',
    'payment_terms:manage',
    'billing:run',
    'billing:view',
    'invoices:read',
    'invoices:manage',
  ],
  staff: [
    'taxes:read',
    'payment_terms:read',
    'billing:view',
    'invoices:read',
    'invoices:manage',
  ],
  customer: [],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = rolePermissions[role]
  return permissions ? permissions.includes(permission) : false
}
