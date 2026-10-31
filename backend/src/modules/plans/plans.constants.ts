// Statuses and enums for plans (values match DB CHECK constraints).
export const BILLING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number]

/** The four plan-level policy flags, in the order they appear in `plan.policies`. */
export const POLICY_KEYS = [
  'auto_close_on_end',
  'allow_early_close',
  'allow_pause',
  'allow_renewal',
] as const
export type PolicyKey = (typeof POLICY_KEYS)[number]

/** Whitelisted list sort fields (prefix `-` = descending). */
export const PLAN_SORT_FIELDS = ['name', 'price', 'available_from', 'created_at'] as const
export const MAX_PLAN_PRODUCTS = 200

/** Postgres constraint names, used to translate DB errors into API errors. */
export const PLAN_NAME_UNIQUE = 'plans_name_key'
