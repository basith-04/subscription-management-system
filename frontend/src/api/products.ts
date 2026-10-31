import { apiRequest } from '../lib/api'
import type { Product, ProductVariant, PageMeta } from '../features/products/types'

export interface ListProductsParams { q?: string; product_type?: string; is_active?: boolean; sort?: string; page?: number; page_size?: number }
export interface ListResponse<T> { data: T[]; meta: PageMeta }

export function listProducts(params: ListProductsParams = {}): Promise<ListResponse<Product>> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.product_type) qs.set('product_type', params.product_type)
  if (params.is_active !== undefined) qs.set('is_active', String(params.is_active))
  if (params.sort) qs.set('sort', params.sort)
  if (params.page) qs.set('page', String(params.page))
  if (params.page_size) qs.set('page_size', String(params.page_size))
  return apiRequest<ListResponse<Product>>(`/products?${qs.toString()}`, { raw: true })
}

export function getProduct(id: number): Promise<Product> {
  return apiRequest<Product>(`/products/${id}`)
}

export interface CreateProductInput { name: string; product_type: 'service' | 'software' | 'addon' | 'physical'; sales_price: string; cost_price: string; notes?: string }
export function createProduct(input: CreateProductInput): Promise<Product> {
  return apiRequest<Product>('/products', { method: 'POST', body: JSON.stringify(input) })
}

export function listVariants(productId: number): Promise<ProductVariant[]> {
  return apiRequest<ProductVariant[]>(`/products/${productId}/variants`)
}

export interface CreateVariantInput { attribute_name: string; attribute_value: string; price_adjustment: string }
export function addVariant(productId: number, input: CreateVariantInput): Promise<ProductVariant> {
  return apiRequest<ProductVariant>(`/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(input) })
}
