/**
 * Canonical email normalization used by validation, services and rate limiting.
 * The database CITEXT unique constraint remains the authoritative guard.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
