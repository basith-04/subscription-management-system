import { describe, expect, it } from 'vitest'
import {
  createPlanBody,
  listPlansQuery,
  replacePlanProductsBody,
  updatePlanBody,
} from '../../../src/modules/plans/plans.schemas.js'

const valid = {
  name: 'Monthly Pro',
  price: '499.00',
  billing_frequency: 'monthly',
  min_quantity: 1,
  available_from: '2026-01-01',
  available_to: '2026-12-31',
  auto_close_on_end: true,
  allow_early_close: false,
  allow_pause: true,
  allow_renewal: true,
}

describe('createPlanBody', () => {
  it('accepts a valid plan and applies defaults', () => {
    const parsed = createPlanBody.parse({ ...valid, available_to: undefined, min_quantity: undefined })
    expect(parsed.min_quantity).toBe(1)
    expect(parsed.available_to).toBeNull()
    expect(parsed.is_active).toBe(true)
  })

  it.each(['daily', 'weekly', 'monthly', 'yearly'])('accepts frequency %s', (billing_frequency) => {
    expect(createPlanBody.safeParse({ ...valid, billing_frequency }).success).toBe(true)
  })

  it('rejects an unknown frequency', () => {
    expect(createPlanBody.safeParse({ ...valid, billing_frequency: 'hourly' }).success).toBe(false)
  })

  it('rejects available_to before available_from', () => {
    const result = createPlanBody.safeParse({ ...valid, available_to: '2025-12-31' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['available_to'])
  })

  it('accepts available_to equal to available_from', () => {
    expect(createPlanBody.safeParse({ ...valid, available_to: '2026-01-01' }).success).toBe(true)
  })

  it('rejects impossible calendar dates', () => {
    expect(createPlanBody.safeParse({ ...valid, available_from: '2026-02-30' }).success).toBe(false)
  })

  it('rejects min_quantity below 1', () => {
    expect(createPlanBody.safeParse({ ...valid, min_quantity: 0 }).success).toBe(false)
  })

  it.each(['auto_close_on_end', 'allow_early_close', 'allow_pause', 'allow_renewal'])(
    'requires the %s policy boolean',
    (key) => {
      const body: Record<string, unknown> = { ...valid }
      delete body[key]
      expect(createPlanBody.safeParse(body).success).toBe(false)
      expect(createPlanBody.safeParse({ ...valid, [key]: 'yes' }).success).toBe(false)
    },
  )

  it('rejects numeric or malformed money', () => {
    expect(createPlanBody.safeParse({ ...valid, price: 499 }).success).toBe(false)
    expect(createPlanBody.safeParse({ ...valid, price: '-1.00' }).success).toBe(false)
    expect(createPlanBody.safeParse({ ...valid, price: '1.234' }).success).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(createPlanBody.safeParse({ ...valid, bogus: 1 }).success).toBe(false)
  })
})

describe('updatePlanBody', () => {
  it('accepts a subset and rejects an empty body', () => {
    expect(updatePlanBody.safeParse({ allow_pause: false }).success).toBe(true)
    expect(updatePlanBody.safeParse({}).success).toBe(false)
  })

  it('rejects an inverted range when both dates are sent', () => {
    expect(updatePlanBody.safeParse({ available_from: '2026-05-01', available_to: '2026-04-01' }).success).toBe(false)
  })
})

describe('replacePlanProductsBody', () => {
  it('rejects duplicate rows including duplicate NULL variants', () => {
    const dup = replacePlanProductsBody.safeParse({
      products: [
        { product_id: 1, default_quantity: 1 },
        { product_id: 1, variant_id: null, default_quantity: 2 },
      ],
    })
    expect(dup.success).toBe(false)
  })

  it('allows the same product with different variants', () => {
    expect(
      replacePlanProductsBody.safeParse({
        products: [
          { product_id: 1, default_quantity: 1 },
          { product_id: 1, variant_id: 5, default_quantity: 1 },
          { product_id: 1, variant_id: 6, default_quantity: 1 },
        ],
      }).success,
    ).toBe(true)
  })

  it('requires default_quantity >= 1', () => {
    expect(replacePlanProductsBody.safeParse({ products: [{ product_id: 1, default_quantity: 0 }] }).success).toBe(false)
  })
})

describe('listPlansQuery', () => {
  it('parses documented filters', () => {
    const q = listPlansQuery.parse({ billing_frequency: 'weekly', is_active: 'false', available_on: '2026-03-01' })
    expect(q.is_active).toBe(false)
  })

  it('rejects unknown filters and sorts', () => {
    expect(listPlansQuery.safeParse({ nope: '1' }).success).toBe(false)
    expect(listPlansQuery.safeParse({ sort: 'secret' }).success).toBe(false)
    expect(listPlansQuery.safeParse({ sort: '-price,name' }).success).toBe(true)
  })
})
