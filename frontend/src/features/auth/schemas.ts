import { z } from 'zod'

// Mirrors backend/src/lib/password.ts; the backend remains authoritative.
export const passwordRules = [
  { label: 'More than 8 characters', valid: (s: string) => s.length > 8 },
  { label: 'At most 128 characters', valid: (s: string) => s.length <= 128 },
  { label: 'An uppercase letter', valid: (s: string) => /[A-Z]/.test(s) },
  { label: 'A lowercase letter', valid: (s: string) => /[a-z]/.test(s) },
  { label: 'A special character', valid: (s: string) => /[^A-Za-z0-9]/.test(s) },
]

const email = z.string().trim().max(254).email('Enter a valid email address').transform((s) => s.toLowerCase())
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) })
export const registerSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required').max(120),
  email,
  password: z.string().superRefine((s, ctx) => {
    for (const rule of passwordRules) if (!rule.valid(s)) ctx.addIssue({ code: 'custom', message: rule.label })
  }),
  company_name: z.string().trim().max(200),
  phone: z.string().trim().max(32),
}).superRefine((input, ctx) => {
  if (input.password.toLowerCase() === input.email) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password must not be your email address' })
})
export type LoginInput = z.input<typeof loginSchema>
export type RegisterInput = z.input<typeof registerSchema>
