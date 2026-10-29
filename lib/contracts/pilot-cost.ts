import {createHash} from 'node:crypto';
import {z} from 'zod';

export const costCategories=['hosting','blob','registry','sandbox','model','research','embedding','email'] as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
// Integer millionths of a dollar avoid floating-point budget arithmetic.
export const microUsd=z.number().int().min(0).max(1_000_000_000_000);
export const costBudgetSchema=z.strictObject({
 contract:z.literal('pilot-cost-v1'),id:z.uuid(),environmentId:z.string().min(1).max(256),
 category:z.enum(costCategories),authorizationDigest:digest,scopeDigest:digest,
 pricingDigest:digest,capMicroUsd:microUsd.refine(n=>n>0),expiresAt:z.iso.datetime({offset:true}),
});
export const costReservationSchema=z.strictObject({
 id:z.uuid(),budgetId:z.uuid(),operationDigest:digest,upperBoundMicroUsd:microUsd,
 state:z.enum(['reserved','dispatched','unknown','settled','released']),
 chargedMicroUsd:microUsd.nullable(),chargeKind:z.enum(['actual','estimate']).nullable(),
});
export type CostBudget=z.infer<typeof costBudgetSchema>;
export type CostReservation=z.infer<typeof costReservationSchema>;
export function remainingCost(budget:CostBudget,reservations:CostReservation[]){
 budget=costBudgetSchema.parse(budget);const ids=new Set<string>();let used=0;
 for(const raw of reservations){const r=costReservationSchema.parse(raw);
  if(r.budgetId!==budget.id||ids.has(r.id))throw Error('Cost inventory identity differs');ids.add(r.id);
  if(r.state==='unknown')throw Error('Unknown charge holds admission');
  if(r.state==='settled'){
   if(r.chargedMicroUsd===null||r.chargeKind===null)throw Error('Charge reconciliation required');
   used+=r.chargeKind==='estimate'?Math.max(r.upperBoundMicroUsd,r.chargedMicroUsd):r.chargedMicroUsd;
  }else{if(r.chargedMicroUsd!==null||r.chargeKind!==null)throw Error('Invalid charge state');if(r.state!=='released')used+=r.upperBoundMicroUsd;}
  if(!Number.isSafeInteger(used))throw Error('Cost arithmetic exceeded bound');
 }
 return budget.capMicroUsd-used;
}
/** Authority is provisioned separately by the database owner; this is accounting only. */
export function admitCost(input:{budget:CostBudget;reservations:CostReservation[];category:typeof costCategories[number];scopeDigest:string;pricingDigest:string;upperBoundMicroUsd:number;now?:number}){
 const budget=costBudgetSchema.parse(input.budget),bound=microUsd.parse(input.upperBoundMicroUsd);
 if(budget.category!==input.category||budget.scopeDigest!==input.scopeDigest||budget.pricingDigest!==input.pricingDigest||Date.parse(budget.expiresAt)<=(input.now??Date.now()))throw Error('Applicable cost authority unavailable');
 if(bound>remainingCost(budget,input.reservations))throw Error('Insufficient remaining budget');
 return bound;
}
export function costOperationDigest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
