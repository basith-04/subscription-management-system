export interface User {
  id: number
  email: string
  full_name: string
  is_active: boolean
  role: string
  created_at: string
  updated_at: string
}
export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }
