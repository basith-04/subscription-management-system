import { describe, expect, it } from 'vitest'
import { computeLine, computeTotals, resolveUnitPrice } from './pricing.js'

describe('resolveUnitPrice', () => {
  const product = { sales_price: '1000.00' }
  const variant = { price_adjustment: '560.00' }

  it('uses the F06 effective price when there is no override', () => {
    expect(resolveUnitPrice({ product, variant })).toBe('1560.00')
    expect(resolveUnitPrice({ product })).toBe('1000.00')
  })

  it('prioritizes line override, including zero, over template override and catalogue', () => {
    expect(resolveUnitPrice({ product, variant, lineOverride: '0', templateOverride: '2.00' })).toBe('0.00')
    expect(resolveUnitPrice({ product, variant, lineOverride: null, templateOverride: '2.00' })).toBe('2.00')
  })

  it('rejects invalid, negative and out-of-range prices', () => {
    for (const lineOverride of ['-1.00', '1.001', '1e3', '10000000000.00']) {
      expect(() => resolveUnitPrice({ product, lineOverride })).toThrow()
    }
    expect(() => resolveUnitPrice({ product, variant: { price_adjustment: '-1000.01' } })).toThrow()
  })
})

describe('computeLine', () => {
  it('rounds 33.33 at 5% to 1.67', () => {
    expect(computeLine({ unit_price: '33.33', quantity: 1, tax_rate: '5.000' })).toEqual({
      line_amount: '33.33', tax_amount: '1.67', line_total: '35.00',
    })
  })

  it('rounds half-up per line and handles fractional percentage rates exactly', () => {
    expect(computeLine({ unit_price: '0.01', quantity: 1, tax_rate: '50' }).tax_amount).toBe('0.01')
    expect(computeLine({ unit_price: '0.01', quantity: 1, tax_rate: '49.999' }).tax_amount).toBe('0.00')
    expect(computeLine({ unit_price: '99.99', quantity: 3, tax_rate: '18.125' })).toEqual({
      line_amount: '299.97', tax_amount: '54.37', line_total: '354.34',
    })
  })

  it('rejects invalid quantities, amounts, rates and line overflow', () => {
    for (const quantity of [0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeLine({ quantity, unit_price: '1.00' })).toThrow()
    }
    for (const tax_rate of ['-1', '100.001', '5.0001', '1e2', '']) {
      expect(() => computeLine({ quantity: 1, unit_price: '1.00', tax_rate })).toThrow()
    }
    expect(() => computeLine({ quantity: 2, unit_price: '9999999999.99' })).toThrow()
  })
})

describe('computeTotals', () => {
  it('sums individually rounded taxes and returns pre-discount strings', () => {
    expect(computeTotals([
      { quantity: 1, unit_price: '0.05', tax_rate: '10.000' },
      { quantity: 1, unit_price: '0.05', tax_rate: '10.000' },
      { quantity: 2, unit_price: '10.00' },
    ])).toEqual({ subtotal: '20.10', estimated_tax: '0.02', total: '20.12' })
  })

  it('handles empty lists and the database amount boundary without float conversion', () => {
    expect(computeTotals([])).toEqual({ subtotal: '0.00', estimated_tax: '0.00', total: '0.00' })
    expect(computeLine({ quantity: 1, unit_price: '9999999999.99', tax_rate: '0' }).line_amount).toBe('9999999999.99')
  })
})

describe('NUMERIC(12,2) ceiling', () => {
  it('rejects a line whose tax pushes the total over the column limit, but accepts the exact limit', () => {
    expect(() => computeLine({ quantity: 1, unit_price: '9999999999.99', tax_rate: '0' })).not.toThrow()
    expect(() => computeLine({ quantity: 1, unit_price: '9999999999.99', tax_rate: '1' })).toThrow(RangeError)
    expect(computeLine({ quantity: 1, unit_price: '9999999999.99' }).line_total).toBe('9999999999.99')
  })
  it('rejects totals whose sum exceeds the limit even when every line fits', () => {
    const line = { quantity: 1, unit_price: '9999999999.99' }
    expect(() => computeTotals([line, line])).toThrow(RangeError)
    expect(() => computeTotals([{ quantity: 1, unit_price: '5000000000.00' }, { quantity: 1, unit_price: '4999999999.99' }])).not.toThrow()
  })
})
