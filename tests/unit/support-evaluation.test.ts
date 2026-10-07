import { describe, expect, it } from "vitest";
import { supportEvaluationCases, supportEvaluationBounds, validateSupportEvaluationCohort } from "../fixtures/support/evaluation";
import { supportCaptureSettled } from "../../scripts/support-capture-settlement";

describe("support actual-output cohort identity", () => {
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
