import type {SpecialistKind} from '../../../contracts/specialist-discussions';
import type {SpecialistAllowance} from './discussion-budget';

/** Existing per-worker limits, shared by native session and durable admission. */
export const specialistPolicies:Record<SpecialistKind,Readonly<SpecialistAllowance&{timeoutMs:number}>>={
 'customer-update':{inputTokens:400000,outputTokens:32000,microUsd:3000000,timeoutMs:600000},
 solution:{inputTokens:400000,outputTokens:32000,microUsd:3000000,timeoutMs:600000},
 'best-practices':{inputTokens:400000,outputTokens:28000,microUsd:2000000,timeoutMs:600000},
};

/** A conversation may use the three existing worker envelopes cumulatively;
 * closing a discussion or starting another cannot replenish this envelope. */
export const conversationSpecialistAllowance=Object.values(specialistPolicies).reduce<SpecialistAllowance>((sum,policy)=>({
 inputTokens:sum.inputTokens+policy.inputTokens,outputTokens:sum.outputTokens+policy.outputTokens,microUsd:sum.microUsd+policy.microUsd,
}),{inputTokens:0,outputTokens:0,microUsd:0});

export function specialistSessionLimits(kind:SpecialistKind){
 const policy=specialistPolicies[kind];
 return {sessionUsage:({total}:{total:{inputTokens:number;outputTokens:number;costUsd?:number|null}})=>
  total.inputTokens>=policy.inputTokens||total.outputTokens>=policy.outputTokens||(total.costUsd??0)*1000000>=policy.microUsd,
 sessionTimeoutMs:policy.timeoutMs};
}
