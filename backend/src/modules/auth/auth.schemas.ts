import { z } from 'zod'
import { passwordSchema } from '../../lib/password.js'
import { normalizeEmail } from '../../lib/text.js'

const emailSchema = z
  .string()
  .trim()
  .max(254, 'Email must be at most 254 characters long')
  .email('Enter a valid email address')
  .transform(normalizeEmail)

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters long`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, 'Full name is required')
      .max(120, 'Full name must be at most 120 characters long'),
    email: emailSchema,
    password: passwordSchema,
    company_name: optionalText(200, 'Company name'),
    phone: optionalText(32, 'Phone'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.password.toLowerCase() === value.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not be your email address',
      })
    }
  })

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1, 'Password is required')
      .max(128, 'Password must be at most 128 characters long'),
  })
  .strict()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
