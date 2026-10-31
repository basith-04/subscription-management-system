// Zod form schemas for customers (mirror backend format rules; UX only — the API is authoritative).
import { z } from 'zod'
import type { CustomerAddress, CustomerPayload, OwnProfilePayload } from './types'

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`)

const phone = z
  .string()
  .trim()
  .max(32, 'Phone must be at most 32 characters')
  .refine((v) => v === '' || /^\+?[\d\s().-]{5,32}$/.test(v), 'Enter a valid phone number')

const addressFields = {
  address_line1: text(200, 'Address line 1'),
  address_line2: text(200, 'Address line 2'),
  address_city: text(100, 'City'),
  address_state: text(100, 'State'),
  address_postal_code: text(20, 'Postal code'),
  address_country: text(100, 'Country'),
}

export const customerFormSchema = z.object({
  name: text(120, 'Name').min(1, 'Name is required'),
  company_name: text(200, 'Company'),
  email: z.string().trim().min(1, 'Email is required').max(254, 'Email must be at most 254 characters').email('Enter a valid email address'),
  phone,
  ...addressFields,
  tax_id: text(50, 'Tax ID'),
  notes: text(2000, 'Notes'),
})
export type CustomerFormValues = z.infer<typeof customerFormSchema>

/** Customer self-service: only the fields `PATCH /me/profile` accepts. */
export const profileFormSchema = customerFormSchema.pick({
  name: true, company_name: true, phone: true,
  address_line1: true, address_line2: true, address_city: true,
  address_state: true, address_postal_code: true, address_country: true,
})
export type ProfileFormValues = z.infer<typeof profileFormSchema>

const nullable = (v: string) => (v.trim() === '' ? null : v.trim())

const toAddress = (v: ProfileFormValues): CustomerPayload['address'] => ({
  line1: nullable(v.address_line1), line2: nullable(v.address_line2), city: nullable(v.address_city),
  state: nullable(v.address_state), postal_code: nullable(v.address_postal_code), country: nullable(v.address_country),
})

export function toCustomerPayload(v: CustomerFormValues): CustomerPayload {
  return {
    name: v.name.trim(), company_name: nullable(v.company_name), email: v.email.trim(), phone: nullable(v.phone),
    address: toAddress(v), tax_id: nullable(v.tax_id), notes: nullable(v.notes),
  }
}

export function toProfilePayload(v: ProfileFormValues): OwnProfilePayload {
  return { name: v.name.trim(), company_name: nullable(v.company_name), phone: nullable(v.phone), address: toAddress(v) }
}

export const emptyAddressValues = {
  address_line1: '', address_line2: '', address_city: '', address_state: '', address_postal_code: '', address_country: '',
}

export function addressToValues(a: CustomerAddress) {
  return {
    address_line1: a.line1 ?? '', address_line2: a.line2 ?? '', address_city: a.city ?? '',
    address_state: a.state ?? '', address_postal_code: a.postal_code ?? '', address_country: a.country ?? '',
  }
}

/** Map a server field path (`address.postal_code`) to a form field name (`address_postal_code`). */
export const serverFieldToFormField = (field: string): string => field.replace('.', '_')
