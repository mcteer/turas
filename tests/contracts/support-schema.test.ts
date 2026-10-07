import { describe, expect, it } from "vitest";
import { supportAssessmentSchema, supportExternalReference, supportDate, supportTimezone } from "../../lib/contracts/support";
import { supportReadinessKeys } from "../../lib/support/readiness";

describe("support untrusted contracts", () => {
  const assessment = () => ({ contractVersion: "support-v1", rubricVersion: "support-readiness-v1",
    title: "Synthetic readiness", observationDate: "2026-10-04", nextReviewDate: "2026-10-11", timezone: "UTC",
    checks: supportReadinessKeys.map(key => ({ key, status: "unknown", rationale: "No accepted evidence", sourceKeys: [],
      discoveryNeed: "Confirm operating readiness" })),
  });
  it("accepts six explicit unknowns without manufacturing readiness", () => {
    expect(supportAssessmentSchema.safeParse(assessment()).success).toBe(true);
  });
  it("rejects duplicate areas and unsupported ready judgments", () => {
    const duplicate = assessment(); duplicate.checks[1] = duplicate.checks[0]!;
    expect(supportAssessmentSchema.safeParse(duplicate).success).toBe(false);
    const unsupported = assessment(); unsupported.checks[0]!.status = "ready";
    expect(supportAssessmentSchema.safeParse(unsupported).success).toBe(false);
  });
  it("rejects unknown fields and same-day review", () => {
    expect(supportAssessmentSchema.safeParse({ ...assessment(), approved: true }).success).toBe(false);
    expect(supportAssessmentSchema.safeParse({ ...assessment(), nextReviewDate: "2026-10-04" }).success).toBe(false);
  });
  it("rejects invalid calendar dates and timezones", () => {
    expect(supportDate.safeParse("2026-02-29").success).toBe(false);
    expect(supportDate.safeParse("2028-02-29").success).toBe(true);
    expect(supportTimezone.safeParse("not/a-zone").success).toBe(false);
    expect(supportTimezone.safeParse("+01:00").success).toBe(false);
  });
  it.each(["http://example.test/ticket", "https://user:pass@example.test/ticket",
    "https://example.test/ticket?token=private", "https://example.test/ticket#secret",
    "https://example.test/ticket?", "https://example.test/ticket#"])("rejects unsafe external reference %s", reference => {
    expect(supportExternalReference.safeParse(reference).success).toBe(false);
  });
  it("accepts a plain HTTPS reference without fetching it", () => {
    expect(supportExternalReference.safeParse("https://example.test/ticket/123").success).toBe(true);
  });
});
