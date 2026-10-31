// Public API of the subscriptions module — exports service functions only.
// F10 extends the state machine in subscriptions.state-machine.ts and the shared transition() helper;
// F11/F12/F14/F15 read subscriptions through get/list rather than querying the tables directly.
export { get as getSubscription, list as listSubscriptions } from './subscriptions.service.js'
export type { SubscriptionDto, ListItemDto, LineDto } from './subscriptions.service.js'
export { getF09Transition, assertQuotationValidity } from './subscriptions.state-machine.js'
export { createQuotationsRouter, createSubscriptionsRouter } from './subscriptions.routes.js'
