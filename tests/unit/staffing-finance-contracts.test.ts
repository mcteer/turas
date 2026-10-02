import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { staffingFinanceInputSchema, staffingFinancePolicyApprovalSchema, staffingScenarioInputSchema, staffingScenarioContentSchema } from "../../lib/contracts/staffing-economics";
const envelope = () => ({ requestKey: randomUUID(), rationale: "Synthetic planning finance input", provenance: "Synthetic entered source reference" });
const rate = () => ({ ...envelope(), input: { kind: "rate", rateKind: "loaded_cost", resourceId: randomUUID(), currency: "USD",
  fromDate: "2026-10-01", toDate: "2026-11-01", minorUnitsPerHour: "100000000" } });
const snapshot = () => ({ scope: { customerId: randomUUID(), engagementId: randomUUID(), baselineId: randomUUID(), baselineDigest: "a".repeat(64),
  currency: "USD", fromDate: "2026-10-01", toDate: "2026-10-01" }, asOf: "2026-09-30T12:00:00Z", formulaVersion: "staffing-economics-v1",
  currency: "USD", exponent: 2, status: "complete", reasons: [], contractedRevenue: "100", nonlaborCost: "10", deliveryCost: "0",
  contribution: "90", marginPercentage: "90.00", hypotheticalServiceRevenue: "0", costGroups: [], serviceGroups: [],
  coverage: { confirmedRows: 0, confirmedMinutes: 0, resourceCount: 0 }, selectedInputRevisionIds: [], inputRevisions: [],
  policyApproval: "unvalidated", policyDecisionId: null, inputPolicyDigest: "b".repeat(64), planningOnly: true, rationale: "Synthetic explicit snapshot" });
describe("typed immutable scenario projections", () => {
  it("rejects added financial claims, private raw payloads and mismatched currency/policy identities", () => {
    const value = snapshot(); expect(staffingScenarioContentSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ currency: "EUR" }, { exponent: 0 }, { policyApproval: "approved" }, { planningOnly: false },
      { actualProfit: "90" }, { provenance: "private" }, { contribution: "-0" }, { contribution: "1000000000000001" }, { inputRevisions: [{ raw: {} }] }])
      expect(staffingScenarioContentSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
});
describe("strict planning finance contracts", () => {
  it("requires bounded canonical rates and entered provenance without arbitrary private fields", () => {
    const value = rate(); expect(staffingFinanceInputSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ provenance: undefined }, { provenance: "" }, { evidence: "PRIVATE_SENTINEL" }])
      expect(staffingFinanceInputSchema.safeParse({ ...value, ...patch }).success).toBe(false);
    for (const patch of [{ minorUnitsPerHour: "100000001" }, { minorUnitsPerHour: "001" }, { currency: "CHF" }, { toDate: value.input.fromDate }])
      expect(staffingFinanceInputSchema.safeParse({ ...value, input: { ...value.input, ...patch } }).success).toBe(false);
  });
  it("requires exact engagement/baseline and an explicit half-open revenue or nonlabor period", () => {
    for (const kind of ["contracted_revenue", "nonlabor"]) {
      const input = { kind, engagementId: randomUUID(), baselineId: randomUUID(), currency: "JPY", minorUnits: "1000000000000",
        fromDate: "2026-10-01", toDate: "2026-11-01" }, value = { ...envelope(), input };
      expect(staffingFinanceInputSchema.safeParse(value).success).toBe(true);
      for (const patch of [{ baselineId: undefined }, { fromDate: undefined }, { minorUnits: 100 }, { minorUnits: "1000000000001" }, { fromDate: "2026-11-01" }])
        expect(staffingFinanceInputSchema.safeParse({ ...value, input: { ...input, ...patch } }).success).toBe(false);
    }
  });
  it("binds human policy approval to exact formula and digest, without caller-granted approval state", () => {
    const value = { requestKey: randomUUID(), rationale: "Synthetic human policy review", formulaVersion: "staffing-economics-v1", inputPolicyDigest: "a".repeat(64) };
    expect(staffingFinancePolicyApprovalSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ formulaVersion: "staffing-economics-v2" }, { inputPolicyDigest: undefined }, { approved: true }, { quoteApproved: true }])
      expect(staffingFinancePolicyApprovalSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it("binds scenario period and baseline while leaving all amounts and approval to governed retrieval", () => {
    const value = { requestKey: randomUUID(), rationale: "Synthetic immutable scenario", customerId: randomUUID(), engagementId: randomUUID(),
      baselineId: randomUUID(), baselineDigest: "a".repeat(64), fromDate: "2028-02-29", toDate: "2028-05-29", currency: "EUR" };
    expect(staffingScenarioInputSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ toDate: "2028-05-30" }, { rates: [] }, { contribution: "100" }, { status: "complete" }, { policyApproval: "approved" }])
      expect(staffingScenarioInputSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
});
