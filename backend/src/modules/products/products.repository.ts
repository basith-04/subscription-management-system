import { query } from '../../lib/db.js'

export interface ProductRow {
  id: string
  name: string
  product_type: 'service' | 'software' | 'addon' | 'physical'
  sales_price: string
  cost_price: string
  notes: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface VariantRow {
  id: string
  product_id: string
  attribute_name: string
  attribute_value: string
  price_adjustment: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export async function listProducts(filters: {
  q?: string
  product_type?: string
  is_active?: boolean
  sort?: string
  limit: number
  offset: number
}): Promise<{ rows: ProductRow[]; total: number }> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.q) {
    params.push(`%${filters.q}%`)
    conditions.push(`name ILIKE $${params.length}`)
  }
  if (filters.product_type) {
    params.push(filters.product_type)
    conditions.push(`product_type = $${params.length}`)
  }
  if (filters.is_active !== undefined) {
    params.push(filters.is_active)
    conditions.push(`is_active = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const sortMap: Record<string, string> = {
    name: 'name ASC',
    '-name': 'name DESC',
    sales_price: 'sales_price ASC',
    '-sales_price': 'sales_price DESC',
    created_at: 'created_at ASC',
    '-created_at': 'created_at DESC',
  }
  const order = sortMap[filters.sort ?? '-created_at'] ?? 'created_at DESC'

  const countResult = await query<{ count: string }>(`SELECT count(*) AS count FROM products ${where}`, params)
  const total = Number(countResult.rows[0]?.count ?? 0)

  params.push(filters.limit, filters.offset)
  const listResult = await query<ProductRow>(
    `SELECT id::text, name, product_type, sales_price::text, cost_price::text, notes, is_active, created_at, updated_at
       FROM products ${where}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return { rows: listResult.rows, total }
}

export async function findProductById(id: number): Promise<ProductRow | null> {
  const { rows } = await query<ProductRow>(
    `SELECT id::text, name, product_type, sales_price::text, cost_price::text, notes, is_active, created_at, updated_at
       FROM products WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function insertProduct(input: {
  name: string
  product_type: string
  sales_price: string
  cost_price: string
  notes?: string | null
}): Promise<ProductRow> {
  const { rows } = await query<ProductRow>(
    `INSERT INTO products (name, product_type, sales_price, cost_price, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text, name, product_type, sales_price::text, cost_price::text, notes, is_active, created_at, updated_at`,
    [input.name, input.product_type, input.sales_price, input.cost_price, input.notes ?? null],
  )
  return rows[0]!
}

export async function updateProduct(id: number, patch: Record<string, unknown>): Promise<ProductRow | null> {
  const allowed = ['name', 'product_type', 'sales_price', 'cost_price', 'notes', 'is_active'] as const
  const sets: string[] = []
  const params: unknown[] = []
  for (const key of allowed) {
    if (key in patch) {
      params.push(patch[key])
      sets.push(`${key} = $${params.length}`)
    }
  }
  if (sets.length === 0) return findProductById(id)
  params.push(id)
  const { rows } = await query<ProductRow>(
    `UPDATE products SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING id::text, name, product_type, sales_price::text, cost_price::text, notes, is_active, created_at, updated_at`,
    params,
  )
  return rows[0] ?? null
}

export async function deleteProduct(id: number): Promise<void> {
  await query(`DELETE FROM products WHERE id = $1`, [id])
}

export async function listVariants(productId: number): Promise<VariantRow[]> {
  const { rows } = await query<VariantRow>(
    `SELECT id::text, product_id::text, attribute_name, attribute_value,
            price_adjustment::text, is_active, created_at, updated_at
       FROM product_variants WHERE product_id = $1 ORDER BY id`,
    [productId],
  )
  return rows
}

export async function findVariantById(id: number): Promise<VariantRow | null> {
  const { rows } = await query<VariantRow>(
    `SELECT id::text, product_id::text, attribute_name, attribute_value,
            price_adjustment::text, is_active, created_at, updated_at
       FROM product_variants WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function insertVariant(input: {
  product_id: number
  attribute_name: string
  attribute_value: string
  price_adjustment: string
}): Promise<VariantRow> {
  const { rows } = await query<VariantRow>(
    `INSERT INTO product_variants (product_id, attribute_name, attribute_value, price_adjustment)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, product_id::text, attribute_name, attribute_value,
               price_adjustment::text, is_active, created_at, updated_at`,
    [input.product_id, input.attribute_name, input.attribute_value, input.price_adjustment],
  )
  return rows[0]!
}

export async function updateVariant(id: number, patch: Record<string, unknown>): Promise<VariantRow | null> {
  const allowed = ['attribute_name', 'attribute_value', 'price_adjustment', 'is_active'] as const
  const sets: string[] = []
  const params: unknown[] = []
  for (const key of allowed) {
    if (key in patch) {
      params.push(patch[key])
      sets.push(`${key} = $${params.length}`)
    }
  }
  if (sets.length === 0) return findVariantById(id)
  params.push(id)
  const { rows } = await query<VariantRow>(
    `UPDATE product_variants SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${params.length}
     RETURNING id::text, product_id::text, attribute_name, attribute_value,
               price_adjustment::text, is_active, created_at, updated_at`,
    params,
  )
  return rows[0] ?? null
}

export async function deleteVariant(id: number): Promise<void> {
  await query(`DELETE FROM product_variants WHERE id = $1`, [id])
}
