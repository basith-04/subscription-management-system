import './products.css'

export type { Product, ProductVariant, PageMeta } from './types'
export { ProductListPage } from './pages/ProductListPage'
export { ProductDetailPage } from './pages/ProductDetailPage'
export { ProductFormPage } from './pages/ProductFormPage'
export { ProductSelect } from './components/ProductSelect'
export { VariantSelect } from './components/VariantSelect'
export {
  ProductDetailRoute,
  ProductFormRoute,
  ProductListRoute,
} from './routes/ProductRoutes'
