// Integration boundary between the plan product editor and F06/F00 shared inputs.
//
// F06's ProductSelect / VariantSelect and F00's MoneyInput are not implemented yet (placeholder files).
// PlanProductsEditor therefore receives them through `slots`. The defaults below are TEMPORARY, minimal
// stand-ins (numeric id / text inputs) that exist only so the editor works end to end today.
// TODO(F06/F00): when the real components land, pass them from the app shell (or switch the defaults)
// and delete this file's fallbacks. Do not extend them.
import type { ChangeEvent, ComponentType } from 'react'

export interface ProductSelectProps {
  id: string
  label: string
  value: number | null
  onChange: (productId: number | null, hint?: { name?: string }) => void
  disabled?: boolean
}
export interface VariantSelectProps {
  id: string
  label: string
  productId: number | null
  value: number | null
  onChange: (variantId: number | null, hint?: { label?: string }) => void
  disabled?: boolean
}
export interface MoneyFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export interface ProductEditorSlots {
  ProductSelect: ComponentType<ProductSelectProps>
  VariantSelect: ComponentType<VariantSelectProps>
  MoneyInput: ComponentType<MoneyFieldProps>
}

const toId = (e: ChangeEvent<HTMLInputElement>): number | null => {
  const n = Number.parseInt(e.target.value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function FallbackProductSelect({ id, label, value, onChange, disabled }: ProductSelectProps) {
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      min={1}
      inputMode="numeric"
      placeholder="Product ID"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(toId(e))}
    />
  )
}

function FallbackVariantSelect({ id, label, productId, value, onChange, disabled }: VariantSelectProps) {
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      min={1}
      inputMode="numeric"
      placeholder="Variant ID (optional)"
      value={value ?? ''}
      disabled={disabled || productId === null}
      onChange={(e) => onChange(toId(e))}
    />
  )
}

function FallbackMoneyInput({ id, label, value, onChange, disabled, placeholder }: MoneyFieldProps) {
  return (
    <input
      id={id}
      aria-label={label}
      inputMode="decimal"
      placeholder={placeholder ?? '0.00'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export const defaultSlots: ProductEditorSlots = {
  ProductSelect: FallbackProductSelect,
  VariantSelect: FallbackVariantSelect,
  MoneyInput: FallbackMoneyInput,
}
