// Pagination parsers and meta builders. page_size caps at 100 per the API spec.
import type { PageMeta } from './responses.js'

export interface ParsedPagination {
  page: number
  page_size: number
  limit: number
  offset: number
}

export function parsePagination(query: Record<string, unknown>): ParsedPagination {
  const rawPage = parseInt(String(query.page ?? '1'), 10)
  const rawSize = parseInt(String(query.page_size ?? '20'), 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const page_size = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20
  return { page, page_size, limit: page_size, offset: (page - 1) * page_size }
}

export function buildMeta(total: number, page: number, page_size: number): PageMeta {
  return { page, page_size, total, total_pages: page_size > 0 ? Math.ceil(total / page_size) : 0 }
}