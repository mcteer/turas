import { describe, expect, it } from "vitest";
import { supportEvaluationCases, supportEvaluationBounds, validateSupportEvaluationCohort } from "../fixtures/support/evaluation";
import { supportCaptureSettled } from "../../scripts/support-capture-settlement";
import { captureSupportProviderOutput, supportProviderFinishReason } from "../../scripts/support-provider-output";
import { supportDigest } from "../../lib/server/support/commands";

describe("support actual-output cohort identity", () => {
  it("captures only a bounded exact final suggestion, not tool narration or malformed output", () => {
    expect(supportProviderFinishReason({ unified: "stop", raw: "private-provider-detail" })).toBe("stop");
    expect(supportProviderFinishReason("private-provider-detail")).toBe("unknown");
    expect(supportProviderFinishReason(null)).toBe("unknown");
    const output = { contractVersion: "support-advice-v1", summary: "Verify ownership", facts: [], unknowns: ["Owner"],
      actionSuggestions: [{ citationKeys: [], content: { contractVersion: "support-v1", title: "Verify ownership",
        observationDate: "2026-10-07", nextReviewDate: "2026-10-14", timezone: "UTC", desiredOutcome: "Confirm owner",
        rationale: "Owner unknown", validationCriterion: "Human verifies role", priority: "normal",
        owner: { kind: "unassigned", reason: "Unknown owner" }, disposition: "open", outcomeSourceKeys: [] } }] };
    const text = JSON.stringify(output);
    expect(captureSupportProviderOutput(text, { unified: "stop" })).toEqual({ text, output, digest: supportDigest(output) });
    expect(captureSupportProviderOutput(text, "tool-calls")).toBeNull();
    expect(captureSupportProviderOutput(text, "length")).toBeNull();
    expect(captureSupportProviderOutput("Narration", "stop")).toBeNull();
    expect(captureSupportProviderOutput(JSON.stringify({ ...output, actionSuggestions: [] }), "stop")).toBeNull();
    expect(() => captureSupportProviderOutput("x".repeat(131073), "stop")).toThrow("exceeds bound");
  });
  it("waits for native terminal state and every admitted usage receipt after invalid output", () => {
    const failed = { state: "failed", response_state: "running", admitted_steps: 2, usage_steps: 1 };
    expect(supportCaptureSettled(failed)).toBe(false);
    expect(supportCaptureSettled({ ...failed, response_state: "failed" })).toBe(false);
    expect(supportCaptureSettled({ ...failed, response_state: "failed", usage_steps: 2 })).toBe(true);
    expect(supportCaptureSettled({ ...failed, state: "running", response_state: "completed", usage_steps: 2 })).toBe(false);
    expect(supportCaptureSettled(undefined)).toBe(false);
    expect(supportCaptureSettled({ ...failed, response_state: "failed", admitted_steps: -1, usage_steps: -1 })).toBe(false);
  });
  it("requires all eight scenarios once in order, including the withheld case", () => {
    const ids = supportEvaluationCases.map(item => item.id);
    expect(() => validateSupportEvaluationCohort(ids)).not.toThrow();
    for (const invalid of [[], ids.slice(0, 7), [...ids, "S01"], [...ids].reverse(), [...ids.slice(0, 7), "S01"]])
      expect(() => validateSupportEvaluationCohort(invalid)).toThrow();
    expect(supportEvaluationCases.filter(item => item.expectedRelease === "withheld").map(item => item.id)).toEqual(["S08"]);
  });
  it("bounds paid work and records semantic review requirements for every case", () => {
    expect(supportEvaluationBounds).toMatchObject({ cases: 8, admissionsPerCase: 1, stepsPerAttempt: 6,
      outputTokensPerStep: 4096, deadlineMs: 120000, automaticPaidRetries: 0 });
    expect(supportEvaluationCases.every(item => item.review.length >= 3 && item.fixture.length > 0)).toBe(true);
  });
});
