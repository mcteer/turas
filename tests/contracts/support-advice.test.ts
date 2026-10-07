import { describe, expect, it } from "vitest";
import { SUPPORT_ADVICE_LIMITS, supportSummaryToolSchema, supportActionsToolSchema, supportEvidenceToolSchema,
  supportSkillToolSchema, validateSupportAdviceResult, supportContextCharge } from "../../lib/support/advice";

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
});
