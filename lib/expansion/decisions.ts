import type { ExpansionDisposition } from '../contracts/expansion';
export function expansionAllowedDecisions(disposition: ExpansionDisposition) {
 return disposition === 'dismissed' ? ['dismiss','reopen'] as const : disposition === 'deferred' ? ['defer','reopen'] as const : ['qualify','defer','dismiss'] as const;
}
