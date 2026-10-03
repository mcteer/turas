import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { EXECUTION_ADVICE_LIMITS, executionToolInput, executionContextCharge, assertExecutionStepLimits } from "../../lib/execution/advice";

describe("execution explanation capability and budget contracts", () => {
  it("offers only three strict bound reads and the exact procedure", () => {
    for (const name of ["execution_summary", "execution_effort"]) {
      expect(executionToolInput(name, {})).toEqual({});
      for (const key of ["customerId", "engagementId", "baselineId", "resourceId", "conversationId", "bypass", "query", "url"])
        expect(() => executionToolInput(name, { [key]: randomUUID() })).toThrow();
    }
    expect(executionToolInput("execution_records", { kind: "activity", limit: 20 })).toEqual({ kind: "activity", limit: 20 });
    for (const input of [{ limit: 21 }, { limit: 0 }, { state: "draft" }, { kind: "time" }, { ids: [randomUUID()] }, { cursor: "x".repeat(4097) }])
      expect(() => executionToolInput("execution_records", input)).toThrow();
    expect(executionToolInput("load_skill", { skill: "execution-explanation" })).toEqual({ skill: "execution-explanation" });
    expect(() => executionToolInput("load_skill", { skill: "staffing-advice" })).toThrow();
    for (const name of ["customer_context", "search_evidence", "artifact_context", "read_research", "propose_customer_context", "read_staffing_demand", "bash", "fetch", "save_delivery_plan_draft"])
      expect(() => executionToolInput(name, {})).toThrow();
  });
  it("counts procedure reads, exact UTF-8 bytes and dependency union before release", () => {
    const last = { contextBytes: 24575, readCalls: 5, dependencyCount: 199 };
    expect(executionContextCharge(last, { bytes: 1, read: true, dependencyCount: 200 })).toEqual({ contextBytes: 24576, readCalls: 6, dependencyCount: 200 });
    for (const charge of [{ bytes: 2, read: true, dependencyCount: 200 }, { bytes: 0, read: false, dependencyCount: 201 }, { bytes: -1, read: false, dependencyCount: 199 }, { bytes: 0, read: false, dependencyCount: 198 }])
      expect(() => executionContextCharge(last, charge)).toThrow();
    expect(() => executionContextCharge({ ...last, readCalls: 6 }, { bytes: 0, read: true, dependencyCount: 199 })).toThrow();
    expect(() => executionContextCharge(last, { bytes: Buffer.byteLength("é", "utf8"), read: false, dependencyCount: 199 })).toThrow();
  });
  it("admits the sixth step within a finite deadline and refuses overflow or uncertain replay", () => {
    const now = Date.now(), input = { turnId: "turn-fixture", stepIndex: 5, stepsAdmitted: 5, deadlineAt: new Date(now + 1) };
    expect(() => assertExecutionStepLimits(input, now)).not.toThrow();
    for (const patch of [{ stepIndex: 6 }, { stepIndex: -1 }, { stepsAdmitted: 6 }, { stepIndex: 4 }, { deadlineAt: new Date(now) }, { turnId: "" }])
      expect(() => assertExecutionStepLimits({ ...input, ...patch }, now)).toThrow();
    expect(EXECUTION_ADVICE_LIMITS).toMatchObject({ steps: 6, reads: 6, outputTokens: 4096, deadlineMs: 120000, contextBytes: 24576, dependencies: 200, hourlyAdmissions: 5 });
  });
});
