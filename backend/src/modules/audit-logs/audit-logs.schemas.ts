import { z } from 'zod'

const optionalText = z.string().trim().min(1).max(120).optional()
const auditDate = z.string().datetime({ offset: true }).transform((value) => new Date(value))

export const listAuditLogsQuery = z.object({
  entity_type: optionalText,
  entity_id: z.coerce.number().int().positive().optional(),
  actor_user_id: z.coerce.number().int().positive().optional(),
  action: optionalText,
  date_from: auditDate.optional(),
  date_to: auditDate.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
}).strict().superRefine((value, context) => {
  if (value.date_from && value.date_to && value.date_from > value.date_to) {
    context.addIssue({ code: 'custom', path: ['date_to'], message: 'date_to must be on or after date_from' })
  }
})

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuery>
