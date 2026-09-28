import { describe, expect, it } from "vitest";
import { artifactMetricRecord } from "../../lib/server/artifacts/telemetry";

describe("artifact telemetry", () => {
  it("emits bounded numeric measures without source identifiers or text", () => {
    const result = artifactMetricRecord("parse_duration_ms",123.6);
    expect(result).toEqual({ kind: "turas_artifact_metric",metric: "parse_duration_ms",value: 124 });
    expect(Object.keys(result)).toEqual(["kind","metric","value"]);
    expect(() => artifactMetricRecord("parse_duration_ms",Number.POSITIVE_INFINITY)).toThrow();
    expect(() => artifactMetricRecord("cleanup_lag_ms",-1)).toThrow();
  });
});
