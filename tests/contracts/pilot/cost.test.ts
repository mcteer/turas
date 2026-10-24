import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admitCost,remainingCost,costReservationSchema,type CostBudget,type CostReservation} from '../../../lib/contracts/pilot-cost';
const digest='a'.repeat(64);
function budget():CostBudget{return {contract:'pilot-cost-v1',id:randomUUID(),environmentId:'test-pilot-cost',category:'sandbox',authorizationDigest:digest,scopeDigest:digest,pricingDigest:digest,capMicroUsd:1_000_000,expiresAt:new Date(Date.now()+60000).toISOString()};}
function input(){return {budget:budget(),reservations:[] as CostReservation[],category:'sandbox' as const,scopeDigest:digest,pricingDigest:digest,upperBoundMicroUsd:400_000};}
function reservation(b:CostBudget,state:CostReservation['state']='reserved'):CostReservation{return {id:randomUUID(),budgetId:b.id,operationDigest:digest,upperBoundMicroUsd:800_000,state,chargedMicroUsd:null,chargeKind:null};}
it('admits only a finite authorized reservation',()=>{const i=input();expect(admitCost(i)).toBe(400_000);expect(()=>admitCost({...i,scopeDigest:'b'.repeat(64)})).toThrow('authority');expect(()=>admitCost({...i,budget:{...i.budget,expiresAt:new Date(0).toISOString()}})).toThrow('authority');});
it('rejects a missing cost bound',()=>{expect(()=>admitCost({...input(),upperBoundMicroUsd:undefined as unknown as number})).toThrow();expect(()=>admitCost({...input(),upperBoundMicroUsd:Infinity})).toThrow();});
it('rejects an insufficient remaining budget',()=>{const i=input();expect(()=>admitCost({...i,reservations:[reservation(i.budget)]})).toThrow('Insufficient');});
it('retains in flight reservations',()=>{const b=budget();expect(remainingCost(b,[reservation(b,'dispatched')])).toBe(200_000);});
it('holds unknown provider charges',()=>{const b=budget();expect(()=>remainingCost(b,[reservation(b,'unknown')])).toThrow('Unknown');});
it('separates service and model cost categories',()=>{expect(()=>admitCost({...input(),category:'model'})).toThrow('authority');});
it('labels estimates separately from actual charges',()=>{const b=budget(),r={...reservation(b,'settled'),chargedMicroUsd:100_000,chargeKind:'estimate' as const};expect(remainingCost(b,[r])).toBe(200_000);expect(remainingCost(b,[{...r,chargeKind:'actual'}])).toBe(900_000);expect(()=>remainingCost(b,[{...r,chargeKind:null}])).toThrow('reconciliation');});
it('never retries uncertain paid dispatch',()=>{const i=input(),r=reservation(i.budget,'unknown');expect(()=>admitCost({...i,reservations:[r]})).toThrow('Unknown');expect(()=>costReservationSchema.parse({...r,state:'retry'})).toThrow();expect(()=>remainingCost(i.budget,[r,r])).toThrow();});
