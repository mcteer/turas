import { describe, expect, it } from "vitest";
import { retrievalMetricRecord } from "../../lib/server/retrieval/telemetry";

describe("retrieval telemetry", () => {
  it("emits a fixed content-free shape", () => {
    expect(retrievalMetricRecord("ranking_duration_ms",12.5)).toEqual({
      kind: "turas_retrieval_metric",metric: "ranking_duration_ms",value: 13,
    });
  });
  it("rejects unlisted labels, text and invalid measurements", () => {
    for (const value of [NaN,Infinity,-1,365 * 86_400_001]) {
      expect(() => retrievalMetricRecord("queue_age_ms",value)).toThrow(RangeError);
    }
    for (const metric of ["query", "passage_text", "credential", "customer_id"] as const) {
      expect(() => retrievalMetricRecord(metric as never,1)).toThrow(RangeError);
    }
    expect(JSON.stringify(retrievalMetricRecord("denied_count",1))).not.toMatch(
      /query|passage|credential|customer|actor/i);
  });
});
