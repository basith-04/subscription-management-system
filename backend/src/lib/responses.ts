// Success envelope helpers — the ONLY place that writes 2xx JSON bodies.
import type { Response } from 'express'

export interface PageMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ data })
}

export function created<T>(res: Response, data: T, location?: string): void {
  if (location) res.setHeader('Location', location)
  res.status(201).json({ data })
}

export function list<T>(res: Response, data: T[], meta: PageMeta): void {
  res.status(200).json({ data, meta })
}

export function noContent(res: Response): void {
  res.status(204).end()
}