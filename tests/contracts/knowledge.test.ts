import { describe, expect, it } from "vitest";
import { knowledgeCandidateSchema, knowledgeDecisionSchema,
  publishedKnowledgeSchema, sanitizedKnowledgeSchema } from "../../lib/contracts/knowledge";

const payload = {
  title: "Synthetic reusable guidance", productVersion: "2026.9", problem: "Build latency",
  prerequisites: "A supported deployment", solution: "Measure build stages",
  reasoning: "Stage timing identifies the slow step", applicability: "Build pipelines",
  limitations: "No claim about every workload", validation: "Compare timings before and after",
};

describe("shared knowledge public contract", () => {
  it("allows only the nine sanitized fields", () => {
    expect(sanitizedKnowledgeSchema.safeParse(payload).success).toBe(true);
    expect(sanitizedKnowledgeSchema.safeParse({ ...payload,customerName: "Hidden customer" }).success)
      .toBe(false);
    expect(knowledgeCandidateSchema.safeParse({ idempotencyKey: "draft-1",
      customerId: "00000000-0000-4000-8000-000000000001",payload,lineage: [] }).success)
      .toBe(false);
  });

  it("requires explicit review of direct and combined identifiers", () => {
    const decision = { idempotencyKey: "decision-1",expectedRevision: 1,
      expectedDigest: "a".repeat(64),action: "publish",rightsAttested: true,
      sanitizationRationale: "No customer details remain",checklist: {
        namesAndDomainsRemoved: true,repositoriesAndLinksRemoved: true,
        peopleAndCommercialDetailsRemoved: true,
        identifyingConfigurationAndOutcomesRemoved: true,
        countsAndCombinedInferenceReviewed: true,
      } };
    expect(knowledgeDecisionSchema.safeParse(decision).success).toBe(true);
    expect(knowledgeDecisionSchema.safeParse({ ...decision,checklist: {
      ...decision.checklist,countsAndCombinedInferenceReviewed: false } }).success).toBe(false);
  });

  it("rejects private identifiers in ordinary reader payload shape", () => {
    const quality = { rubricVersion: "evidence-quality-v1",R: 2,F: 0,D: 2,C: 1,
      Q: 33,band: "insufficient",freshness: "Unknown",rationale: "Review needed",
      asOf: "2026-09-28T00:00:00.000Z",validUntil: "2026-09-29T00:00:00.000Z" };
    const published = { version: "knowledge-v1",id: "00000000-0000-4000-8000-000000000001",
      revision: 1,payload,quality,publishedAt: "2026-09-28T00:00:00.000Z",caveats: [] };
    expect(publishedKnowledgeSchema.safeParse(published).success).toBe(true);
    expect(publishedKnowledgeSchema.safeParse({ ...published,sourceCustomerId:
      "00000000-0000-4000-8000-000000000002" }).success).toBe(false);
  });
});
