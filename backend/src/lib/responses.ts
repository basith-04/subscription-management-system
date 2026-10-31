import type { Response } from 'express'

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ data })
}

export function created<T>(
  res: Response,
  data: T,
  location?: string,
): void {
  if (location) res.setHeader('Location', location)
  res.status(201).json({ data })
}

export function noContent(res: Response): void {
  res.status(204).send()
}
