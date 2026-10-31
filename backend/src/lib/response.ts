import type { Response } from 'express'

export function ok<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>,
): Response {
  if (meta) {
    return res.status(200).json({ data, meta })
  }
  return res.status(200).json({ data })
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ data })
}

export function noContent(res: Response): Response {
  return res.status(204).send()
}
