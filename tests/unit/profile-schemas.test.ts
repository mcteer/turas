import { describe, expect, it } from "vitest";
import { profilePayloadSchema, recordKindSchema } from "../../lib/contracts/profile-payloads";
import { canonicalRecordKey, profileCommandSchema } from "../../lib/contracts/profiles";

const uuid = "00000000-0000-4000-8000-000000000401";
const qualityInput = {
  rubricVersion: "evidence-quality-v1",
  R: 2, D: 3, C: 1,
  reliabilityRationale: "Named direct source",
  directnessRationale: "Partial support",
  corroborationRationale: "Single independent source",
  informationType: "product_capability",
  dateBasis: "observation",
};
const evidenceRevisionIds = [uuid];
const payloads = [
  { kind: "customer_details", displayName: "Cedar" },
  { kind: "workload_details", name: "Public web", purpose: "Synthetic service" },
  { kind: "stakeholder", name: "Example", role: "Sponsor", responsibilities: "Review delivery" },
  { kind: "product_use", productKey: "vercel-functions", displayName: "Functions", state: "actual", usageDescription: "Synthetic workload", observedAt: "2026-09-01T12:00:00Z" },
  { kind: "maturity_assessment", observationStart: "2026-08-01T00:00:00Z", observationEnd: "2026-09-01T00:00:00Z", assessor: "Example", rubricVersion: "customer-maturity-v1", rationale: "Evidence supports this", dimensions: ["outcome_ownership", "delivery_collaboration", "experience_adoption", "operational_trust", "platform_organization", "innovation_ai"].map((key) => ({ key, state: "Unknown", rationale: "No current evidence", nextCapability: "Gather evidence", evidenceRevisionIds: [] })), nextCapability: "Assign owner", reviewAt: "2026-10-01T00:00:00Z" },
  { kind: "risk", category: "Delivery", description: "Synthetic blocker", owner: "Example", likelihood: 2, impact: 3, severity: "medium", severityRationale: "Limited scope", mitigation: "Review", status: "open", observedAt: "2026-09-01T12:00:00Z" },
  { kind: "engagement_reference", title: "Synthetic engagement", timing: "current", deliveryPhase: "discovery" },
  { kind: "decision", statement: "Proceed with discovery", rationale: "Scope known", effectiveAt: "2026-09-01T12:00:00Z", accountableOwner: "Example", evidenceRevisionIds },
  { kind: "outcome", statement: "Synthetic outcome", evidenceRevisionIds },
  { kind: "next_review", subject: "Delivery risk", owner: "Example", dueAt: "2026-10-01T12:00:00Z", action: "Check status" },
  { kind: "claim", text: "Synthetic claim", sourceType: "manual" },
] as const;

function proposal(payload: object, extra: object = {}) {
  return { requestKey: uuid, action: "propose_record", payload, ...extra };
}

describe("profile schemas", () => {
  it("accepts exactly eleven typed kinds", () => {
    expect(payloads).toHaveLength(11);
    for (const payload of payloads) expect(profilePayloadSchema.safeParse(payload).success).toBe(true);
    expect(recordKindSchema.options).toHaveLength(11);
    for (const payload of payloads) expect(profilePayloadSchema.safeParse({ kind: payload.kind }).success).toBe(false);
  });
  it("rejects unknown fields, cross-kind enums and client-owned authority", () => {
    expect(profilePayloadSchema.safeParse({ ...payloads[3], state: "open" }).success).toBe(false);
    expect(profilePayloadSchema.safeParse({ ...payloads[5], maturityStage: "Scale" }).success).toBe(false);
    for (const field of ["workspaceId", "authorId", "origin", "state", "accepted", "F", "Q"]) {
      expect(profileCommandSchema.safeParse(proposal(payloads[0], { [field]: "forged" })).success).toBe(false);
    }
  });
  it("normalizes omitted quality inputs to persisted unknown values and rejects injected scores", () => {
    const parsed = profileCommandSchema.parse(proposal(payloads[0]));
    if (parsed.action !== "propose_record") throw new Error("unexpected action");
    expect(parsed.qualityInput).toMatchObject({ R: 0, D: 0, C: 0, informationType: "unknown", dateBasis: "unknown" });
    expect(profileCommandSchema.safeParse(proposal(payloads[0], { qualityInput: { ...qualityInput, Q: 100 } })).success).toBe(false);
    expect(profileCommandSchema.safeParse(proposal(payloads[0], { qualityInput })).success).toBe(true);
  });
  it("enforces bounds, dates, URLs and command size", () => {
    expect(profilePayloadSchema.safeParse({ kind: "claim", text: "x".repeat(8001), sourceType: "manual" }).success).toBe(false);
    expect(profilePayloadSchema.safeParse({ kind: "claim", text: "x", sourceType: "manual", sourceUrl: "http://example.com" }).success).toBe(false);
    expect(profilePayloadSchema.safeParse({ ...payloads[3], observedAt: "2027-01-01T00:00:00Z" }).success).toBe(false);
    expect(profilePayloadSchema.safeParse({ ...payloads[3], evidenceRevisionIds: Array(21).fill(uuid) }).success).toBe(false);
    expect(profileCommandSchema.safeParse({ requestKey: uuid, action: "propose_workload", payload: payloads[0] }).success).toBe(false);
    expect(profileCommandSchema.safeParse(proposal(payloads[0], { qualityInput: { ...qualityInput, R: 5 } })).success).toBe(false);
  });
  it("uses one canonical key per customer, scoped workload, product and maturity", () => {
    expect(canonicalRecordKey("customer_details", null, payloads[0])).toBe("customer_details");
    expect(canonicalRecordKey("product_use", null, payloads[3])).toBe("vercel-functions");
    expect(canonicalRecordKey("product_use", uuid, payloads[3])).toBe("vercel-functions");
    expect(canonicalRecordKey("maturity_assessment", uuid, payloads[4])).toBe("maturity_assessment");
    expect(canonicalRecordKey("claim", null, payloads[10])).toBeNull();
  });
});
