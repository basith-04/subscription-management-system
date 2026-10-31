import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface ProductPageHeaderProps {
  title: string
  description?: string
  backTo?: string
  backLabel?: string
  actions?: ReactNode
}

export function ProductPageHeader({
  title,
  description,
  backTo,
  backLabel,
  actions,
}: ProductPageHeaderProps) {
  return (
    <header className="products-page-header">
      <div>
        {backTo && backLabel && <Link className="products-back-link" to={backTo}>← {backLabel}</Link>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="products-page-actions">{actions}</div>}
    </header>
  )
}
