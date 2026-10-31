// Zod request schemas for customers (body, params, query).
import { z } from 'zod'
import { normalizeEmail } from '../../lib/text.js'
import { ADDRESS_KEYS, CUSTOMER_SORT_FIELDS } from './customers.constants.js'

const hasControlChars = (v: string) => [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)

/** Trimmed single-line text; control characters are rejected, Unicode is allowed. */
const line = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters long`)
    .refine((v) => !hasControlChars(v), `${label} contains invalid characters`)

/** Optional single-line text; empty string clears the value (stored as NULL). */
const optionalLine = (max: number, label: string) =>
  line(max, label)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v))

const nameField = line(120, 'Name').min(1, 'Name is required')

const emailField = z
  .string()
  .trim()
  .max(254, 'Email must be at most 254 characters long')
  .email('Enter a valid email address')
  .transform(normalizeEmail)

const phoneField = z
  .string()
  .trim()
  .max(32, 'Phone must be at most 32 characters long')
  .nullable()
  .refine((v) => v === null || v === '' || /^\+?[\d\s().-]{5,32}$/.test(v), 'Enter a valid phone number')
  .transform((v) => (v === null || v === '' ? null : v))

const notesField = z
  .string()
  .trim()
  .max(2000, 'Notes must be at most 2000 characters long')
  .nullable()
  .transform((v) => (v === null || v === '' ? null : v))

export const addressSchema = z
  .object({
    line1: optionalLine(200, 'Address line 1'),
    line2: optionalLine(200, 'Address line 2'),
    city: optionalLine(100, 'City'),
    state: optionalLine(100, 'State'),
    postal_code: optionalLine(20, 'Postal code'),
    country: optionalLine(100, 'Country'),
  })
  .partial()
  .strict()

const id = z.coerce.number().int().positive()
export const customerIdParams = z.object({ id }).strict()

const profileFields = {
  name: nameField,
  company_name: optionalLine(200, 'Company name'),
  phone: phoneField,
  address: addressSchema,
}

export const createCustomerBody = z
  .object({
    ...profileFields,
    email: emailField,
    tax_id: optionalLine(50, 'Tax ID'),
    notes: notesField,
  })
  .partial({ company_name: true, phone: true, address: true, tax_id: true, notes: true })
  .strict()

/** Back-office update (Admin/Staff). `is_active` is accepted by the schema but only Admin may send it. */
export const updateCustomerBody = z
  .object({
    ...profileFields,
    email: emailField,
    tax_id: optionalLine(50, 'Tax ID'),
    notes: notesField,
    is_active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

/**
 * Customer self-service update. Deliberately a separate, strict schema that omits
 * email, is_active, notes and tax_id: those keys are REJECTED (422), never silently applied.
 */
export const updateOwnProfileBody = z
  .object(profileFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })

export const listCustomersQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    sort: z
      .string()
      .refine(
        (s) => s.split(',').every((f) => (CUSTOMER_SORT_FIELDS as readonly string[]).includes(f.replace(/^-/, ''))),
        `sort must be a comma list of: ${CUSTOMER_SORT_FIELDS.join(', ')} (prefix - for descending)`,
      )
      .optional(),
  })
  .strict()

export type Address = z.infer<typeof addressSchema>
export type CreateCustomerInput = z.infer<typeof createCustomerBody>
export type UpdateCustomerInput = z.infer<typeof updateCustomerBody>
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileBody>
export type ListCustomersQuery = z.infer<typeof listCustomersQuery>
export { ADDRESS_KEYS }
