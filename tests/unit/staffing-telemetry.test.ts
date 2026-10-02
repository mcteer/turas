import { describe, expect, it, vi } from "vitest";
import { staffingTelemetryRecord, recordStaffingTelemetry, staffingCommandOperation, staffingConflictCategory, observeStaffingRead } from "../../lib/server/staffing/telemetry";
import { HttpFailure } from "../../lib/contracts/http";
describe("strict redacted staffing telemetry", () => {
  it("observes settled reads without exposing results or raw failure details and distinguishes an outer transaction", async () => {
    const records: Record<string, unknown>[] = [], logger = vi.spyOn(console, "info").mockImplementation(value => records.push(JSON.parse(String(value))));
    const sentinel = "PRIVATE_SYNTHETIC_READ_AND_CONNECTION_SENTINEL";
    try {
      expect(await observeStaffingRead(async () => ({ evidence: sentinel, minorUnits: sentinel }))).toEqual({ evidence: sentinel, minorUnits: sentinel });
      await observeStaffingRead(async () => sentinel, true);
      for (const error of [new HttpFailure(403, "forbidden", sentinel), new HttpFailure(409, "source_changed", sentinel), new Error(sentinel)]) {
        await expect(observeStaffingRead(async () => { throw error; })).rejects.toBe(error);
      }
      expect(records.map(record => record.outcome)).toEqual(["committed", "validated", "denied", "conflict", "failed"]);
      expect(records[3]).toMatchObject({ conflict: "source_changed" });
      expect(JSON.stringify(records)).not.toContain(sentinel);
      for (const record of records) expect(Object.keys(record).every(key => ["kind", "operation", "outcome", "durationMs", "conflict"].includes(key))).toBe(true);
    } finally { logger.mockRestore(); }
  });
  it("accepts bounded operation/count/usage records and preserves unknown usage", () => {
    expect(staffingTelemetryRecord({ operation: "model", outcome: "validated", durationMs: 123, inputTokens: null, outputTokens: 0 }))
      .toEqual({ kind: "turas_staffing_operation", operation: "model", outcome: "validated", durationMs: 123, inputTokens: null, outputTokens: 0 });
    expect(staffingTelemetryRecord({ operation: "cleanup", outcome: "committed", durationMs: 5, count: 20 })).toMatchObject({ count: 20 });
  });
  it("rejects private payload and unknown keys instead of silently logging them", () => {
    for (const key of ["name", "evidence", "filename", "leave", "prompt", "rate", "money", "error", "customer", "request"]) {
      expect(() => staffingTelemetryRecord({ operation: "command", outcome: "failed", durationMs: 1, [key]: "PRIVATE_SYNTHETIC_SENTINEL" })).toThrow();
    }
    for (const patch of [{ operation: "PRIVATE_SYNTHETIC_SENTINEL" }, { conflict: "secret_connection_string" }, { count: -1 }, { inputTokens: "unknown" }, { durationMs: Infinity }])
      expect(() => staffingTelemetryRecord({ operation: "command", outcome: "failed", durationMs: 1, ...patch })).toThrow();
  });
  it("maps only fixed operation/conflict vocabulary and contains logger failure", () => {
    expect(staffingCommandOperation("resource_create")).toBe("registry");
    expect(staffingCommandOperation("finance_source_with_private_text")).toBe("command");
    expect(staffingConflictCategory("capacity_conflict")).toBe("capacity_conflict");
    expect(staffingConflictCategory("PRIVATE_SYNTHETIC_ERROR")).toBeNull();
    const logger = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("Synthetic sink failure"); });
    try { expect(() => recordStaffingTelemetry({ operation: "command", outcome: "failed", durationMs: 1 })).not.toThrow(); }
    finally { logger.mockRestore(); }
  });
});
