export const REPORT_METRICS_VERSION='report-metrics-v1';
function integer(value:string){if(!/^-?\d+$/.test(value))throw new Error('Integer quantity required');return BigInt(value);}
export function formatReportHours(minutes:string){const value=integer(minutes),negative=value<0n,absolute=negative?-value:value;
 const hundredths=(absolute*100n+30n)/60n;return `${negative?'-':''}${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;}
export type ReportEffortInput={fromDate:string;toDate:string;cutoffDate:string;actuals:Array<{revisionId:string;serviceDate:string;minutes:string}>;remainingMinutes:string|null;budgetMinutes:string|null;comparable:boolean;actualsKnown?:boolean};
export function calculateReportEffort(input:ReportEffortInput){
 const entries=new Map<string,ReportEffortInput['actuals'][number]>();
 for(const entry of input.actuals){if(integer(entry.minutes)<0n)throw new Error('Actual contribution cannot be negative');const prior=entries.get(entry.revisionId);if(prior && (prior.minutes!==entry.minutes || prior.serviceDate!==entry.serviceDate))throw new Error('Conflicting exact revision contribution');entries.set(entry.revisionId,entry);}
 let period=0n,cumulative=0n;for(const entry of entries.values()){if(entry.serviceDate>input.cutoffDate)continue;const minutes=integer(entry.minutes);cumulative+=minutes;if(entry.serviceDate>=input.fromDate && entry.serviceDate<=input.toDate)period+=minutes;}
 const remaining=input.remainingMinutes===null?null:integer(input.remainingMinutes),budget=input.budgetMinutes===null?null:integer(input.budgetMinutes);
 if((remaining!==null && remaining<0n) || (budget!==null && budget<0n))throw new Error('Reviewed quantities cannot be negative');
 const known=input.actualsKnown!==false,forecast=remaining===null || !known?null:cumulative+remaining,variance=forecast!==null && budget!==null && input.comparable?forecast-budget:null;
 return {formulaVersion:REPORT_METRICS_VERSION,periodActualMinutes:known?period.toString():null,cumulativeActualMinutes:known?cumulative.toString():null,remainingMinutes:remaining?.toString()??null,
 budgetMinutes:budget?.toString()??null,forecastMinutes:forecast?.toString()??null,varianceMinutes:variance?.toString()??null,
 missingReasons:[...(!known?['actual_unknown']:[]),...(remaining===null?['remaining_unknown']:[]),...(budget===null?['budget_unknown']:[]),...(!input.comparable?['scope_not_comparable']:[])]};
}
function decimal(value:string){if(!/^[+-]?\d+(?:\.\d{1,6})?$/.test(value))throw new Error('Bounded decimal required');const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^[+-]/,'').split('.');return BigInt(whole)*1000000n*(negative?-1n:1n)+BigInt(fraction.padEnd(6,'0'))*(negative?-1n:1n);}
function decimalString(value:bigint){const negative=value<0n,absolute=negative?-value:value,fraction=(absolute%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return `${negative?'-':''}${absolute/1000000n}${fraction?'.'+fraction:''}`;}
export function calculateComparableChange(input:{baseline:string|null;current:string|null;comparable:boolean}){
 if(!input.comparable)return {change:null,percentage:null,reason:'non_comparable'};
 if(input.baseline===null || input.current===null)return {change:null,percentage:null,reason:'measurement_unknown'};
 const baseline=decimal(input.baseline),current=decimal(input.current),change=current-baseline;
 if(baseline===0n)return {change:decimalString(change),percentage:null,reason:'zero_baseline'};
 const negative=(change<0n)!==(baseline<0n),absoluteChange=change<0n?-change:change,absoluteBase=baseline<0n?-baseline:baseline;
 const hundredths=(absoluteChange*10000n+absoluteBase/2n)/absoluteBase;
 return {change:decimalString(change),percentage:`${negative?'-':''}${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`,reason:null};
}
