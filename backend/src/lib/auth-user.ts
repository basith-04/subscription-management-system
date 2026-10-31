/**
 * Trusted identity loaded from the database by `authenticate`. Client-supplied
 * ids or roles are never used to build this object.
 */
export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: string
  customer_id: number | null
}
