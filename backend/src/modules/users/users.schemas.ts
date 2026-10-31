import { z } from 'zod'

const passwordSchema = z.string()
  .min(9, 'Must be at least 9 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character')

export const createStaffSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().email().trim().toLowerCase(),
  password: passwordSchema,
}).strict()

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const listUsersQuerySchema = z.object({
  role: z.enum(['admin', 'staff']).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export const userIdParamSchema = z.object({ id: z.coerce.number().int().positive() })

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
