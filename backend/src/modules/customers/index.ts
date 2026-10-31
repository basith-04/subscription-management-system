// Public API of the customers module — exports service functions only.
export { toCustomerDto, get as getCustomer, list as listCustomers } from './customers.service.js'
export type { CustomerDto, CustomerDetailDto, CustomerListItemDto, OwnProfileDto } from './customers.service.js'
