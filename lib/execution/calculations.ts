/** Deterministic arithmetic only. Authority, source selection and snapshots belong
 * to the server domain. Inputs are counted contributions, never revision history. */
import {Temporal} from "@js-temporal/polyfill";
export const EXECUTION_EFFORT_VERSION = "execution-effort-v1";
type Minutes = string | number | bigint;
const dayMs = 86_400_000;
function minutes(value: Minutes): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Unsafe minute value");
  const text=String(value);
  if (!/^(0|[1-9]\d{0,63})$/.test(text)) throw new Error("Invalid minute value");
  return BigInt(text);
}
function instant(value:string):bigint {
  if(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value))throw new Error("Invalid UTC instant");
  return Temporal.Instant.from(value).epochNanoseconds;
}
function date(value:string):number {const result=Date.parse(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(result)||new Date(result).toISOString().slice(0,10)!==value)throw new Error("Invalid calendar date");return result;}
export type RemainingEstimate = { minutes: Minutes; asOf: string; explicitZero: boolean };
export function estimateFreshness(estimate:RemainingEstimate|null,asOf:string,lastMutationAt:string|null,reconciledAt:string|null):string|null {
  if(!estimate)return "missing_estimate";
  const entered=instant(estimate.asOf),now=instant(asOf),quantity=minutes(estimate.minutes);
  if(entered>now)return "future_estimate";
  if(quantity===0n&&!estimate.explicitZero)return "zero_not_asserted";
  if(reconciledAt&&entered<instant(reconciledAt))return "baseline_reconciliation";
  if(lastMutationAt&&entered<instant(lastMutationAt))return "actuals_after_estimate";
  if(Temporal.PlainDate.from(estimate.asOf.slice(0,10)).until(Temporal.PlainDate.from(asOf.slice(0,10))).days>7)return "stale_estimate";
  return null;
}
export type EffortInput = {
  asOf:string;period:{from:string;to:string};baselineCurrent:boolean;reconciledAt:string|null;
  packages:readonly {key:string;budgetMinutes:Minutes|null;estimate:RemainingEstimate|null;lastActualMutationAt:string|null}[];
  actuals:readonly {minutes:Minutes;date:string;billable:boolean;mappedKey:string|null;disposition:"current"|"mapped"|"retired"|"unmapped"}[];
};
export function calculateExecutionEffort(input:EffortInput) {
  instant(input.asOf);const days=(date(input.period.to)-date(input.period.from))/dayMs;
  if(days<0||days>90||input.packages.length>100||input.actuals.length>100000||new Set(input.packages.map(p=>p.key)).size!==input.packages.length)throw new Error("Invalid effort scope");
  const keys=new Set(input.packages.map(p=>p.key));
  let lifetime=0n,period=0n,billable=0n,unmapped=0n;
  const mapped=new Map<string,bigint>();
  for(const row of input.actuals){date(row.date);const quantity=minutes(row.minutes);lifetime+=quantity;
    if(row.date>=input.period.from&&row.date<=input.period.to){period+=quantity;if(row.billable)billable+=quantity;}
    if(row.mappedKey&&keys.has(row.mappedKey)&&["current","mapped"].includes(row.disposition))mapped.set(row.mappedKey,(mapped.get(row.mappedKey)??0n)+quantity);
    else unmapped+=quantity;
  }
  const missingEstimates:Array<{key:string;reason:string}>=[],missingBudgets:string[]=[];
  let remaining=0n,budget=0n;
  const workPackages=input.packages.map(p=>{
    const reason=estimateFreshness(p.estimate,input.asOf,p.lastActualMutationAt,input.reconciledAt);
    if(reason)missingEstimates.push({key:p.key,reason});else remaining+=minutes(p.estimate!.minutes);
    if(p.budgetMinutes===null)missingBudgets.push(p.key);else budget+=minutes(p.budgetMinutes);
    return {key:p.key,actualMinutes:String(mapped.get(p.key)??0n),budgetMinutes:p.budgetMinutes===null?null:String(minutes(p.budgetMinutes)),
      remainingMinutes:reason?null:String(minutes(p.estimate!.minutes)),estimateAsOf:p.estimate?.asOf??null,estimateReason:reason};
  });
  const forecastReason=!input.baselineCurrent?"unreconciled_baseline":missingEstimates.length?"incomplete_estimates":null;
  const varianceReason=forecastReason??(missingBudgets.length?"missing_budget":unmapped>0n?"unmapped_historical_actual":null);
  return {formulaVersion:EXECUTION_EFFORT_VERSION,actualLifetimeMinutes:String(lifetime),actualPeriodMinutes:String(period),
    billablePeriodMinutes:String(billable),nonbillablePeriodMinutes:String(period-billable),unmappedHistoricalMinutes:String(unmapped),
    remainingMinutes:missingEstimates.length||!input.baselineCurrent?null:String(remaining),budgetMinutes:missingBudgets.length?null:String(budget),
    forecastMinutes:forecastReason?null:String(lifetime+remaining),varianceMinutes:varianceReason?null:String(lifetime-unmapped+remaining-budget),
    forecastReason,varianceReason,missingEstimates,missingBudgets,workPackages};
}
export type UtilizationDay={resourceId:string;date:string;actualBillableMinutes:Minutes;availableMinutes:Minutes|null;reason:string|null};
export function calculateActualUtilization(days:readonly UtilizationDay[]){
  if(!days.length||days.length>4550||new Set(days.map(d=>d.resourceId)).size>50)throw new Error("Invalid utilization scope");
  const seen=new Set<string>(),reasons:Array<{resourceId:string;date:string;reason:string}>=[];let actual=0n,available=0n;
  for(const row of days){date(row.date);const key=`${row.resourceId}/${row.date}`;if(seen.has(key))throw new Error("Duplicate resource date");seen.add(key);
    actual+=minutes(row.actualBillableMinutes);
    if(row.availableMinutes===null||row.reason)reasons.push({resourceId:row.resourceId,date:row.date,reason:row.reason??"missing_calendar"});
    else available+=minutes(row.availableMinutes);
  }
  const state=reasons.length?"incomplete":available===0n?"not_applicable":"complete";
  const scaled=state==="complete"?(actual*10000n*2n+available)/(available*2n):null;
  return {formulaVersion:EXECUTION_EFFORT_VERSION,actualBillableMinutes:String(actual),availableMinutes:reasons.length?null:String(available),
    percentage:scaled===null?null:`${scaled/100n}.${String(scaled%100n).padStart(2,"0")}`,state,reasons};
}
