import {customerContextSchema,researchBriefSchema} from "../../lib/server/research/specialists/solution-research/schema";
export const context = customerContextSchema.parse({
  accountId: "11111111-1111-4111-8111-111111111111",
  name: "Alderwick Labs (fictional company)",
  synthetic: true,
  snapshotVersion: "test-1",
  journalStatus: "available",
  moreAvailable: false,
  evidence: [
    {
      id: "journal:test:r1",
      title: "Fictional environment assessment",
      summary:
        "The pilot team uses Next.js, weekly release review, a security reviewer, trained administrators and an assigned operating owner. These are fictional test facts.",
      observedAt: "2026-09-19",
      reviewAfter: "2026-12-01",
      source: "Fictional test note",
      scope: "One pilot team",
      basis: "fictional_scenario",
    },
  ],
});
export const sources = [
  "https://vercel.com/docs/ai-gateway",
  "https://nextjs.org/docs",
  "https://vercel.com/docs/workflow",
].map((url, i) => ({
  id: `source-test-${i}`,
  url,
  title: "Fictional retrieval fixture",
  retrievedAt: "2026-09-20T00:00:00.000Z",
  excerpt: `Fixture statement ${i} supports a limited test claim. This text is synthetic test content, not a quotation from the linked website.`,
}));
export const brief = researchBriefSchema.parse({
  schemaVersion: 1,
  accountId: context.accountId,
  question: "Should the fictional pilot proceed?",
  proposal: "A bounded pilot with an operating owner.",
  recommendation: "Validate a reversible pilot; do not approve automatically.",
  findings: [
    "technology_stack",
    "delivery_processes",
    "security_and_constraints",
    "adoption_and_success",
    "alternatives_and_standards",
    "commercial_delivery",
    "rollout_and_measurement",
  ].map((dimension) => ({
    dimension,
    assessment: "Fictional evidence supports testing the fit.",
    customerEvidenceIds: ["journal:test:r1"],
    sourceIds: ["source-test-0"],
    basis: "inference",
    fit: "conditional",
    implication: "Validate with the pilot owner.",
    validationNeeded: "Pilot acceptance and measured usage.",
  })),
  alternatives: ["proposed", "alternative", "status_quo"].map((kind) => ({
    kind,
    name: kind,
    tradeoff: "Compare implementation and operating effort.",
    customerFit: "Conditional on pilot outcomes.",
    sourceIds: ["source-test-0"],
  })),
  rollout: [
    {
      phase: "Pilot",
      ownerRole: "Customer operating owner",
      prerequisite: "Security and scope acceptance",
      exitCriterion: "Independent operation and rollback test",
      rollback: "Return to the existing process",
    },
  ],
  measures: [
    {
      metric: "Weekly active eligible users",
      baseline: "Unknown until measured",
      target: "Proposed with the sponsor",
      collection: "Consented aggregate telemetry",
      ownerRole: "Customer success lead",
      reviewWindow: "30 days",
      basis: "proposed",
      customerEvidenceIds: [],
    },
  ],
  gaps: [],
  conflicts: [],
  sourceSupport: sources.map((s) => ({
    sourceId: s.id,
    quote: s.excerpt,
    supports: "Fictional test claim",
    publisher: "Test fixture",
    publishedAt: null,
    sourceType: "primary_documentation",
  })),
});
