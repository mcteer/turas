export const planMetricNames=[
  "transition_count","conflict_count","invalidation_count","cleanup_count",
  "read_duration_ms","decision_duration_ms","cleanup_duration_ms","model_input_tokens",
  "model_output_tokens",
] as const;
export type PlanMetric=typeof planMetricNames[number];
const allowed=new Set<string>(planMetricNames);

/** Fixed vocabulary and bounded number only; no content, source or identity labels. */
export function planMetricRecord(metric:PlanMetric,value:number) {
  if (!allowed.has(metric) || !Number.isFinite(value) || value<0 ||
      value>365*86_400_000) throw new RangeError("Invalid plan metric");
  return {kind:"turas_plan_metric" as const,metric,value:Math.round(value)};
}

export function recordPlanMetric(metric:PlanMetric,value:number):void {
  console.info(JSON.stringify(planMetricRecord(metric,value)));
}

let readCount=0;
/** One bounded latency sample per twenty reads avoids log I/O on every list item. */
export function recordSampledPlanReadDuration(value:number):void {
  readCount += 1;
  if(readCount%20===0)recordPlanMetric("read_duration_ms",value);
}
