export {
  list as listProducts, get as getProduct, create as createProduct,
  update as updateProduct, remove as deleteProduct,
  listVariantsForProduct, addVariant, updateVariant, removeVariant,
} from './products.service.js'
export { computeEffectivePrice } from '../../lib/pricing.js'
export type { ProductResponse, VariantResponse } from './products.service.js'
