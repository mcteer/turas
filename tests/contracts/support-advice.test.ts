import { describe, expect, it } from "vitest";
import { SUPPORT_ADVICE_LIMITS, supportSummaryToolSchema, supportActionsToolSchema, supportEvidenceToolSchema,
  supportSkillToolSchema, validateSupportAdviceResult, supportContextCharge, supportAdviceInstructions } from "../../lib/support/advice";

describe("bounded support advice contract", () => {
  it("allows only strict bound reads and the named procedure", () => {
    expect(supportSummaryToolSchema.safeParse({ customerId: "other" }).success).toBe(false);
    expect(supportActionsToolSchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(supportEvidenceToolSchema.safeParse({ sourceKeys: [] }).success).toBe(false);
    expect(supportSkillToolSchema.safeParse({ name: "research" }).success).toBe(false);
    expect(supportSkillToolSchema.safeParse({ name: "tam-support-guidance" }).success).toBe(true);
  });
  it("rejects fabricated fact citations and never repairs malformed results", () => {
    const key = "00000000-0000-4000-8000-000000000001";
    const output = { contractVersion: "support-advice-v1", summary: "Verify operating ownership", facts: [], unknowns: ["Operating owner"], actionSuggestions: [] };
    expect(validateSupportAdviceResult(output, [])).toEqual(output);
    expect(() => validateSupportAdviceResult({ ...output, facts: [{ statement: "Ready", citationKeys: [key] }] }, [])).toThrow();
    expect(() => validateSupportAdviceResult({ ...output, sent: true }, [])).toThrow();
  });
  it("charges UTF-8 context without truncation and fixes all paid-call bounds", () => {
    expect(supportContextCharge("€")).toBe(5);
    expect(() => supportContextCharge("€".repeat(8192))).toThrow();
    expect(SUPPORT_ADVICE_LIMITS).toMatchObject({ steps: 6, reads: 6, outputTokens: 4096,
      contextBytes: 24576, dependencies: 200, hourlyAdmissions: 5, deadlineMs: 120000 });
  });
  it("supplies selected evidence and server dates in the exact charged instruction", () => {
    const snapshot = { currentDate: "2026-10-07", defaultNextReviewDate: "2026-10-14",
      evidence: [{ citationKey: "00000000-0000-4000-8000-000000000001", text: "Historical route is unverified",
        observationDate: "2025-09-02", quality: { freshness: "Stale" } }] };
    const instruction = supportAdviceInstructions(snapshot);
    expect(instruction).toContain(JSON.stringify(snapshot));
    expect(instruction).toContain("never invent the current date");
    expect(supportContextCharge(instruction)).toBe(Buffer.byteLength(JSON.stringify(instruction)));
    expect(() => supportContextCharge(supportAdviceInstructions({ evidence: "€".repeat(8192) }))).toThrow();
  });
  it("withholds future model observations before they can be released or saved", () => {
    const output = { contractVersion: "support-advice-v1", summary: "Confirm the operating owner", facts: [], unknowns: ["Operating owner"],
      actionSuggestions: [{ citationKeys: [], content: { contractVersion: "support-v1", title: "Verify ownership",
        observationDate: "2099-01-01", nextReviewDate: "2099-01-08", timezone: "UTC", desiredOutcome: "Confirm the accountable role",
        rationale: "Ownership is unknown", validationCriterion: "Human reviews an accepted stakeholder record", priority: "normal",
        owner: { kind: "unassigned", reason: "Owner is unknown" }, disposition: "open", outcomeSourceKeys: [] } }] };
    expect(() => validateSupportAdviceResult(output, [])).toThrow("future observation");
  });
  it("refuses model-created assessment bindings before suggestion release", () => {
    const content = { contractVersion: "support-v1", title: "Verify ownership",
      observationDate: "2020-01-01", nextReviewDate: "2099-01-08", timezone: "UTC", desiredOutcome: "Confirm the accountable role",
      rationale: "Ownership is unknown", validationCriterion: "Human reviews an accepted stakeholder record", priority: "normal",
      owner: { kind: "unassigned", reason: "Owner is unknown" }, disposition: "open", outcomeSourceKeys: [] };
    const output = { contractVersion: "support-advice-v1", summary: "Confirm the operating owner", facts: [], unknowns: ["Operating owner"],
      actionSuggestions: [{ citationKeys: [], content }] };
    expect(validateSupportAdviceResult(output, [])).toEqual(output);
    expect(() => validateSupportAdviceResult({ ...output, actionSuggestions: [{ citationKeys: [], content: {
      ...content, basedOnAssessmentRevisionId: "00000000-0000-4000-8000-000000000001",
    } }] }, [])).toThrow("malformed");
  });
});
