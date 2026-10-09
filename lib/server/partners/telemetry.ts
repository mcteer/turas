export type PartnerMetric = { operation:"read"|"write"|"maintenance"; outcome:"committed"|"denied"|"failed"; durationMs:number; correlationId?:string };
const totals=new Map<string,{count:number;durationMs:number}>();
let queueHealth={overdue:0,oldestOverdueSeconds:0};
export function recordPartnerQueueHealth(overdue:number,oldestOverdueSeconds:number){queueHealth={overdue:Math.max(0,Math.min(1000000,Math.floor(Number.isFinite(overdue)?overdue:0))),oldestOverdueSeconds:Math.max(0,Math.min(31536000,Number.isFinite(oldestOverdueSeconds)?oldestOverdueSeconds:0))};}
export function partnerQueueHealth(){return {...queueHealth};}
export function recordPartnerTelemetry(metric:PartnerMetric){const key=`${metric.operation}:${metric.outcome}`;const prior=totals.get(key)??{count:0,durationMs:0};prior.count++;prior.durationMs+=Math.max(0,Math.min(10000,Number.isFinite(metric.durationMs)?metric.durationMs:0));totals.set(key,prior);}
export function partnerMetrics(){return [...totals].map(([key,value])=>({key,...value}));}
