import type { ReactNode } from 'react'

export function ProductFormField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="products-form-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
