import { Navigate, useParams } from 'react-router-dom'
import { ProductDetailPage } from '../pages/ProductDetailPage'
import { ProductFormPage } from '../pages/ProductFormPage'
import { ProductListPage } from '../pages/ProductListPage'

export function ProductListRoute() {
  return <ProductListPage />
}

export function ProductFormRoute() {
  return <ProductFormPage />
}

export function ProductDetailRoute() {
  const id = Number(useParams().id)

  return Number.isSafeInteger(id) && id > 0
    ? <ProductDetailPage id={id} />
    : <Navigate to="/app/products" replace />
}
