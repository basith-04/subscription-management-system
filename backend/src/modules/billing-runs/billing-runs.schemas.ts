import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const createRunBody = z.object({
  as_of: isoDate.optional(),
}).strict()

export const listRunsQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict()

export const runIdParams = z.object({
  id: z.coerce.number().int().positive(),
}).strict()

export const upcomingQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(7),
}).strict()

export const manualCreateInvoiceBody = z.object({
  subscription_id: z.coerce.number().int().positive(),
  period_start: isoDate,
}).strict()

export type CreateRunInput = z.infer<typeof createRunBody>
export type ListRunsQuery = z.infer<typeof listRunsQuery>
export type UpcomingQuery = z.infer<typeof upcomingQuery>
export type ManualCreateInvoiceInput = z.infer<typeof manualCreateInvoiceBody>
