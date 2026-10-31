import { describe, expect, it } from 'vitest'
import {
  cancelQuotationBody, confirmQuotationBody, createSubscriptionBody,
  issueQuotationBody, listQuotationsQuery, listSubscriptionsQuery,
  subscriptionIdParams, subscriptionItemInput, updateSubscriptionBody,
} from './subscriptions.schemas.js'

const direct = { customer_id: 1, plan_id: 2, start_date: '2026-11-01', expiry_date: '2027-10-31' }

describe('subscription request shapes', () => {
  it('accepts direct and template creation and empty draft lines', () => {
    expect(createSubscriptionBody.safeParse({ ...direct, items: [] }).success).toBe(true)
    expect(createSubscriptionBody.safeParse({ customer_id: 1, template_id: 2, start_date: '2026-11-01', expiry_date: '2027-10-31' }).success).toBe(true)
  })

  it('requires a source and leaves template/plan consistency to the service', () => {
    expect(createSubscriptionBody.safeParse({ ...direct, plan_id: undefined }).success).toBe(false)
    expect(createSubscriptionBody.safeParse({ ...direct, template_id: 3 }).success).toBe(true)
  })

  it('rejects invalid calendar dates, reversed ranges and mass assignment', () => {
    for (const values of [
      { start_date: '2025-02-29' }, { start_date: '0000-01-01' },
      { expiry_date: '2026-10-31' }, { status: 'confirmed' }, { created_by: 1 },
    ]) expect(createSubscriptionBody.safeParse({ ...direct, ...values }).success).toBe(false)
    expect(createSubscriptionBody.safeParse({ ...direct, start_date: '2024-02-29' }).success).toBe(true)
  })

  it('allows partial updates but rejects an empty patch and unsafe fields', () => {
    expect(updateSubscriptionBody.safeParse({ items: [] }).success).toBe(true)
    expect(updateSubscriptionBody.safeParse({}).success).toBe(false)
    expect(updateSubscriptionBody.safeParse({ status: 'active' }).success).toBe(false)
    expect(updateSubscriptionBody.safeParse({ start_date: '2026-12-01', expiry_date: '2026-11-01' }).success).toBe(false)
  })

  it('rejects invalid line quantities, prices and unknown snapshot fields', () => {
    expect(subscriptionItemInput.safeParse({ product_id: 1, quantity: 1, unit_price: '0.00' }).success).toBe(true)
    for (const item of [
      { product_id: 1, quantity: 0 }, { product_id: 1, quantity: -1 },
      { product_id: 1, quantity: 2_147_483_648 }, { product_id: 1, quantity: 1, unit_price: '-1.00' },
      { product_id: 1, quantity: 1, unit_price: '1.001' }, { product_id: 1, quantity: 1, tax_rate: '100' },
    ]) expect(subscriptionItemInput.safeParse(item).success).toBe(false)
  })

  it('validates issue, confirm and cancel body shapes', () => {
    expect(issueQuotationBody.safeParse({ valid_until: '2026-11-01' }).success).toBe(true)
    expect(issueQuotationBody.safeParse({ valid_until: '2026-02-30' }).success).toBe(false)
    expect(confirmQuotationBody.safeParse({}).success).toBe(true)
    expect(confirmQuotationBody.safeParse({ customer_id: 2 }).success).toBe(false)
    expect(cancelQuotationBody.safeParse({ reason: '  Changed mind  ' }).data?.reason).toBe('Changed mind')
    expect(cancelQuotationBody.safeParse({ closed_reason: 'expired' }).success).toBe(false)
  })

  it('accepts only safe path ids', () => {
    expect(subscriptionIdParams.parse({ id: '42' }).id).toBe(42)
    for (const value of ['0', '-1', '1.2', '1e3', '9007199254740992']) {
      expect(subscriptionIdParams.safeParse({ id: value }).success).toBe(false)
    }
  })
})

describe('subscription list filters', () => {
  it('parses allowed filters and rejects unknown keys, sorts and excessive pages', () => {
    expect(listSubscriptionsQuery.parse({ paused: 'false', page: '2', page_size: '100', sort: '-created_at,number' })).toMatchObject({ paused: false, page: 2, page_size: 100 })
    expect(listSubscriptionsQuery.safeParse({ sort: 'password_hash' }).success).toBe(false)
    expect(listSubscriptionsQuery.safeParse({ customer_id: '1e3' }).success).toBe(false)
    expect(listSubscriptionsQuery.safeParse({ page_size: '101' }).success).toBe(false)
    expect(listSubscriptionsQuery.safeParse({ unknown: 'x' }).success).toBe(false)
    expect(listSubscriptionsQuery.safeParse({ expiry_from: '2026-12-01', expiry_to: '2026-11-01' }).success).toBe(false)
  })

  it('only accepts quotation statuses for quotation lists', () => {
    expect(listQuotationsQuery.safeParse({ status: 'quotation' }).success).toBe(true)
    expect(listQuotationsQuery.safeParse({ status: 'active' }).success).toBe(false)
  })
})
