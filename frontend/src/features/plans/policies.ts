// Plain-language labels and help text for the four plan policies.
import type { PolicyKey } from './types'

export const POLICY_FIELDS: { key: PolicyKey; label: string; help: string }[] = [
  {
    key: 'auto_close_on_end',
    label: 'Close automatically at plan end',
    help: 'Subscriptions on this plan are closed automatically when they reach their expiry date.',
  },
  {
    key: 'allow_early_close',
    label: 'Allow early closure',
    help: 'Customers and staff may close a subscription before its expiry date.',
  },
  {
    key: 'allow_pause',
    label: 'Allow pause',
    help: 'Customers may pause this subscription.',
  },
  {
    key: 'allow_renewal',
    label: 'Allow renewal',
    help: 'Customers may renew this subscription for another term.',
  },
]

export const POLICY_CHANGE_NOTICE =
  'Policy changes apply to future actions only. They do not change the state of existing subscriptions.'
