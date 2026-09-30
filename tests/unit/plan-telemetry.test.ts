import { describe,expect,it,vi } from "vitest";
import { planMetricRecord,recordPlanMetric,
  recordSampledPlanReadDuration } from "../../lib/server/plans/telemetry";

describe("plan telemetry redaction",()=>{
  it("accepts only fixed metric names and bounded numerical values",()=>{
    expect(planMetricRecord("decision_duration_ms",12.6)).toEqual({
      kind:"turas_plan_metric",metric:"decision_duration_ms",value:13});
    expect(()=>planMetricRecord("customer_title" as never,1)).toThrow(RangeError);
    expect(()=>planMetricRecord("model_output_tokens",Number.NaN)).toThrow(RangeError);
    expect(()=>planMetricRecord("model_output_tokens",-1)).toThrow(RangeError);
  });

  it("does not accept prose, URL, title or credential labels",()=>{
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      recordPlanMetric("conflict_count",1);
      const emitted=String(log.mock.calls[0]?.[0]);
      expect(emitted).toBe('{"kind":"turas_plan_metric","metric":"conflict_count","value":1}');
      expect(emitted).not.toMatch(/customer|https?:|secret|title|password/i);
    } finally {log.mockRestore();}
  });

  it("samples read latency with fixed labels and bounded numbers",()=>{
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      for(let index=0;index<40;index += 1)recordSampledPlanReadDuration(12.4);
      expect(log).toHaveBeenCalledTimes(2);
      for(const call of log.mock.calls)expect(call[0]).toBe(
        '{"kind":"turas_plan_metric","metric":"read_duration_ms","value":12}');
    } finally {log.mockRestore();}
  });
});
