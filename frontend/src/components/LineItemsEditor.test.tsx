import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LineItemsEditor, lineAmount, type LineItemDraft } from './LineItemsEditor'

vi.mock('../features/products', () => ({
  ProductSelect: ({ onChange }: { onChange: (id: number, product: { sales_price: string }) => void }) => <button type="button" onClick={() => onChange(1, { sales_price: '1000.00' })}>Select product</button>,
  VariantSelect: ({ onChange }: { onChange: (id: number, variant: { effective_price: string; is_active: boolean }) => void }) => <button type="button" onClick={() => onChange(2, { effective_price: '1560.00', is_active: true })}>Select variant</button>,
}))
vi.mock('../features/taxes', () => ({ TaxSelect: ({ onChange }: { onChange: (id: string) => void }) => <button type="button" onClick={() => onChange('3')}>Select tax</button> }))
afterEach(cleanup)

function Harness() {
  const [rows, setRows] = useState<LineItemDraft[]>([])
  return <><LineItemsEditor value={rows} onChange={setRows} showTotals /><output>{JSON.stringify(rows)}</output></>
}
describe('LineItemsEditor', () => {
  it('adds/removes rows and preserves intentional overrides when the variant changes', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Add line'))
    fireEvent.click(screen.getByText('Select product'))
    expect((screen.getByLabelText('Unit price') as HTMLInputElement).value).toBe('1000.00')
    fireEvent.click(screen.getByText('Select variant'))
    expect((screen.getByLabelText('Unit price') as HTMLInputElement).value).toBe('1560.00')
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '12.34' } })
    fireEvent.click(screen.getByText('Select variant'))
    expect((screen.getByLabelText('Unit price') as HTMLInputElement).value).toBe('12.34')
    fireEvent.click(screen.getByText('Select tax'))
    expect(screen.getByText(/"tax_rule_id":3/)).toBeTruthy()
    fireEvent.click(screen.getByText('Remove'))
    expect(screen.getByText('No lines yet.')).toBeTruthy()
  })
  it('calculates money exactly and rejects invalid row values', () => {
    expect(lineAmount('1560.00', '2')).toBe('3120.00')
    expect(lineAmount('0.10', '3')).toBe('0.30')
    expect(lineAmount('-1', '3')).toBeNull()
    expect(lineAmount('1.00', '0')).toBeNull()
  })
})
