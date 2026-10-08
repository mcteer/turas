import { describe, expect, it } from "vitest";
import { effectiveSupportReadiness } from "../../lib/support/readiness";

describe("support readiness precedence", () => {
  const today = "2026-10-04";
  const assessment = (statuses: Array<"ready" | "gap" | "unknown" | "not_applicable">) => ({
    checks: statuses.map(status => ({ status })), nextReviewDate: "2026-10-05",
  });
  it("does not infer readiness from absent assessment", () => {
    expect(effectiveSupportReadiness(null, today, true)).toBe("not_assessed");
  });
  it("puts changed evidence and overdue review ahead of gaps", () => {
    expect(effectiveSupportReadiness(assessment(["gap"]), today, false)).toBe("review_required");
    expect(effectiveSupportReadiness({ ...assessment(["gap"]), nextReviewDate: "2026-10-03" }, today, true))
      .toBe("review_required");
  });
  it("keeps the review due date current through that day", () => {
    expect(effectiveSupportReadiness({ ...assessment(["ready"]), nextReviewDate: today }, today, true)).toBe("ready");
  });
  it("does not average away gaps or unknowns", () => {
    expect(effectiveSupportReadiness(assessment(["ready", "unknown", "gap"]), today, true)).toBe("gaps");
    expect(effectiveSupportReadiness(assessment(["ready", "unknown"]), today, true)).toBe("unknown");
  });
  it("requires at least one ready applicable check", () => {
    expect(effectiveSupportReadiness(assessment(["not_applicable", "ready"]), today, true)).toBe("ready");
    expect(effectiveSupportReadiness(assessment(["not_applicable"]), today, true)).toBe("not_applicable");
  });
  it("treats a malformed empty assessment as unknown, not ready", () => {
    expect(effectiveSupportReadiness(assessment([]), today, true)).toBe("unknown");
  });
});
