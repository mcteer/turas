import {roundHalfAway,twoDecimalPercentage} from '../../staffing/arithmetic';
/** Original engagement EAC/contribution arithmetic, using current exact minor units. */
export function engagementMetrics(input:{actualMinutes:string|null;remainingMinutes:string|null;fee:string|null;loadedRate:string|null;nonlabor:string|null}){
 const reasons=Object.entries(input).filter(([,v])=>v===null).map(([k])=>`missing_${k}`);
 if(reasons.length)return {status:'unknown' as const,reasons,metricVersion:'engagement-economics-v1',effortAtCompletionMinutes:null,allocatedDeliveryCost:null,contribution:null,contributionPercent:null};
 const values=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,BigInt(v!)]));
 if(Object.values(values).some(v=>v<0n))throw Error('Negative engagement economics input');
 const effort=values.actualMinutes+values.remainingMinutes,cost=roundHalfAway(effort*values.loadedRate,60n)+values.nonlabor,contribution=values.fee-cost;
 return {status:'known' as const,reasons:[],metricVersion:'engagement-economics-v1',effortAtCompletionMinutes:String(effort),allocatedDeliveryCost:String(cost),contribution:String(contribution),contributionPercent:values.fee===0n?null:twoDecimalPercentage(roundHalfAway(contribution*10000n,values.fee))};
}
/** Never add currencies or silently replace a missing/private amount with zero. */
export function portfolioMetrics(rows:ReadonlyArray<{currency:string|null;fee:string|null;contribution:string|null}>){
 const currencies=[...new Set(rows.flatMap(row=>row.currency?[row.currency]:[]))];
 const complete=rows.length>0&&currencies.length===1&&rows.every(row=>row.currency===currencies[0]);
 const sum=(field:'fee'|'contribution')=>complete&&rows.every(row=>row[field]!==null)?String(rows.reduce((n,row)=>n+BigInt(row[field]!),0n)):null;
 return {currency:complete?currencies[0]:null,forecastRevenue:sum('fee'),forecastContribution:sum('contribution'),complete:complete&&rows.every(row=>row.fee!==null&&row.contribution!==null)};
}
/** Lifetime EAC cannot borrow a reporting period's fee or nonlabor totals. The
 * current finance domain has no independently reviewed whole-contract basis. */
export function wholeEngagementBasis(effort:{actualLifetimeMinutes:string|null;remainingMinutes:string|null}){
 return {actualMinutes:effort.actualLifetimeMinutes,remainingMinutes:effort.remainingMinutes,fee:null as string|null,loadedRate:null as string|null,nonlabor:null as string|null};
}
export type WholeEngagementAssumptions={remainingHours?:number;wholeEngagementFeeMinorUnits?:string;wholeEngagementNonlaborMinorUnits?:string;wholeEngagementLoadedRateMinorUnitsPerHour?:string;currency?:string};
export function wholeEngagementScenario(baseline:Parameters<typeof engagementMetrics>[0],input:WholeEngagementAssumptions){
 const values={...baseline,...(input.remainingHours!==undefined?{remainingMinutes:String(Math.round(input.remainingHours*60))}:{}),...(input.wholeEngagementFeeMinorUnits!==undefined?{fee:input.wholeEngagementFeeMinorUnits}:{}),...(input.wholeEngagementNonlaborMinorUnits!==undefined?{nonlabor:input.wholeEngagementNonlaborMinorUnits}:{}),...(input.wholeEngagementLoadedRateMinorUnitsPerHour!==undefined?{loadedRate:input.wholeEngagementLoadedRateMinorUnitsPerHour}:{})};
 const computed=engagementMetrics(values);
 const metrics=input.currency?computed:{...computed,status:'unknown' as const,reasons:[...computed.reasons,'missing_currency'],effortAtCompletionMinutes:null,allocatedDeliveryCost:null,contribution:null,contributionPercent:null};
 return {values,metrics,currency:input.currency??null};
}
