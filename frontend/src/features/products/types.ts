export interface Product {
  id: number
  name: string
  product_type: 'service' | 'software' | 'addon' | 'physical'
  sales_price: string
  cost_price: string
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  variants?: ProductVariant[]
}
export interface ProductVariant {
  id: number
  product_id: number
  attribute_name: string
  attribute_value: string
  price_adjustment: string
  effective_price: string
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }
