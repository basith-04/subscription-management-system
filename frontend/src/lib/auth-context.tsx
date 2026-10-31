import { createContext, useContext, useState, type ReactNode } from 'react'

export type Role = 'admin' | 'staff' | 'customer'

export type Permission =
  | 'taxes:read'
  | 'taxes:manage'
  | 'payment_terms:read'
  | 'payment_terms:manage'

export interface User {
  id: string
  name: string
  email: string
  role: Role
}

interface AuthContextType {
  user: User
  role: Role
  setRole: (role: Role) => void
  hasPermission: (permission: Permission) => boolean
}

const rolePermissions: Record<Role, readonly Permission[]> = {
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

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({
  children,
  initialRole = 'admin',
}: {
  children: ReactNode
  initialRole?: Role
}) {
  const [role, setRoleState] = useState<Role>(initialRole)

  const user: User = {
    id: `user_${role}`,
    name: `${role.charAt(0).toUpperCase() + role.slice(1)} User`,
    email: `${role}@brightloop.io`,
    role,
  }

  const setRole = (newRole: Role) => {
    setRoleState(newRole)
  }

  const hasPermission = (permission: Permission): boolean => {
    return rolePermissions[role]?.includes(permission) ?? false
  }

  return (
    <AuthContext.Provider value={{ user, role, setRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useCan(permission: Permission): boolean {
  const { hasPermission } = useAuth()
  return hasPermission(permission)
}
