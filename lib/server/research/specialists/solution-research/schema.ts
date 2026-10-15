import { z } from "zod";
import { accountIdSchema } from "../account-id";
import { processImpactSchema } from "./process-impact";
import { informationTypeSchema } from "./freshness";
import { verifiedPublicationDate } from "./source-integrity";
import { snapshotReferenceSchema } from "../research-cache/schema";

const text = (max = 1600) => z.string().trim().min(1).max(max);
export const researchSourceTypeSchema = z.enum([
  "primary_documentation", "customer_publication", "vendor_case_study", "independent_analysis",
  "conference_presentation", "webinar", "practitioner_report",
]);
export const dimensions = [
  "technology_stack",
  "delivery_processes",
  "security_and_constraints",
  "adoption_and_success",
  "alternatives_and_standards",
  "commercial_delivery",
  "rollout_and_measurement",
] as const;
export const dimensionSchema = z.enum(dimensions);
export const contextEvidenceSchema = z
  .object({
    id: text(200),
    title: text(200),
    summary: text(4000),
    observedAt: z.iso.date().nullable(),
    reviewAfter: z.iso.date().nullable(),
    source: text(2000),
    scope: text(500),
    basis: z.enum([
      "reviewed_public_snapshot",
      "checked_public_research",
      "approved_customer_record",
      "fictional_scenario",
    ]),
  })
  .strict();
export const customerContextSchema = z
  .object({
    accountId: accountIdSchema,
    name: text(160),
    synthetic: z.boolean(),
    snapshotVersion: text(200),
    publicEvidenceVersion: text(200).optional(),
    solutionKnowledgeVersion: text(200).optional(),
    researchPolicyVersion: text(200).optional(),
    journalStatus: z.enum(["available", "empty", "denied", "unavailable"]),
    moreAvailable: z.boolean(),
    evidence: z.array(contextEvidenceSchema).max(40),
  })
  .strict();
export type CustomerResearchContext = z.infer<typeof customerContextSchema>;

export const sourceSchema = z
  .object({
    id: text(80),
    url: z.url().max(2000),
    title: text(300),
    retrievedAt: z.iso.datetime(),
    cache: snapshotReferenceSchema.optional(),
    excerpt: text(16000),
    retainedPassages: z.array(z.object({ id: text(120), text: text(500) }).strict()).max(80).optional(),
    informationType: informationTypeSchema.optional(),
    focusTerm: z.string().trim().min(3).max(80).optional(),
    publication: z.object({ date: z.iso.date(), quote: text(500) }).strict().nullable().optional(),
  })
  .strict();
export type ResearchSource = z.infer<typeof sourceSchema>;
const findingSchema = z
  .object({
    dimension: dimensionSchema,
    assessment: text(),
    customerEvidenceIds: z.array(text(200)).max(12),
    sourceIds: z.array(text(80)).max(8),
    basis: z.enum(["supported", "inference", "unknown"]),
    fit: z.enum(["compatible", "conditional", "incompatible", "unknown"]),
    implication: text(),
    validationNeeded: text(),
  })
  .strict();
export const researchBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    accountId: accountIdSchema,
    question: text(1500),
    proposal: text(2000),
    recommendation: text(2000),
    processImpact: z.array(processImpactSchema).max(3).optional(),
    findings: z.array(findingSchema).length(dimensions.length),
    alternatives: z
      .array(
        z
          .object({
            name: text(160),
            kind: z.enum(["proposed", "alternative", "status_quo"]),
            tradeoff: text(),
            customerFit: text(),
            sourceIds: z.array(text(80)).max(8),
          })
          .strict(),
      )
      .min(3)
      .max(5),
    rollout: z
      .array(
        z
          .object({
            phase: text(120),
            ownerRole: text(160),
            prerequisite: text(),
            exitCriterion: text(),
            rollback: text(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    measures: z
      .array(
        z
          .object({
            metric: text(200),
            baseline: text(300),
            target: text(300),
            collection: text(500),
            ownerRole: text(160),
            reviewWindow: text(160),
            basis: z.enum(["proposed", "customer_observed"]),
            customerEvidenceIds: z.array(text(200)).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    gaps: z.array(text(800)).max(15),
    conflicts: z.array(text(800)).max(10),
    sourceSupport: z
      .array(
        z
          .object({
            sourceId: text(80),
            passageId: text(100).optional(),
            quote: text(500),
            supports: text(600),
            publisher: text(160),
            publishedAt: z.iso.date().nullable().describe("Copy source.publication.date only when supplied; otherwise null. Last updated and retrieval dates are not publication dates."),
            sourceType: researchSourceTypeSchema,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type ResearchBrief = z.infer<typeof researchBriefSchema>;

// New submissions select a server-returned passage; legacy quotations remain
// accepted for in-flight sessions and are still checked against retrieved text.
export const researchSubmissionSchema = researchBriefSchema.extend({
  sourceSupport: z.array(researchBriefSchema.shape.sourceSupport.element.extend({
    quote: text(500).optional().describe("Legacy field. Prefer passageId; the server copies its exact text."),
    publishedAt: z.iso.date().nullable().optional().describe("Legacy field. For passageId references the server binds the date from retrieved metadata."),
  }).refine(support => Boolean(support.passageId || support.quote), "Select a returned passageId.")).max(8),
});

export function researchGaps(
  brief: ResearchBrief,
  context: CustomerResearchContext,
  sources: ResearchSource[],
  now = new Date(),
) {
  const blockers: string[] = [];
  if (brief.accountId !== context.accountId)
    blockers.push("Customer account mismatch.");
  if (
    new Set(brief.findings.map((f) => f.dimension)).size !== dimensions.length
  )
    blockers.push("Every assessment dimension must appear exactly once.");
  const contextIds = new Set(context.evidence.map((e) => e.id));
  const sourceIds = new Set(sources.map((s) => s.id));
  const supported = new Set(
    sources
      .filter((source) => {
        const quotations = brief.sourceSupport.filter((support) => support.sourceId === source.id);
        return quotations.length > 0 && quotations.every((support) => source.excerpt.includes(support.quote));
      })
      .map((source) => source.id),
  );
  for(const process of brief.processImpact??[])for(const input of process.inputs){
    if(input.customerEvidenceIds.some(id=>!contextIds.has(id))||input.sourceIds.some(id=>!sourceIds.has(id)||!supported.has(id)))
      blockers.push("Unverified process-impact input reference.");
    if(input.basis==="customer_observed"&&!input.customerEvidenceIds.length)
      blockers.push("Observed process-impact inputs require customer evidence.");
    if(input.basis==="public_benchmark"&&!input.sourceIds.length)
      blockers.push("Public process benchmarks require retrieved source support.");
  }
  for (const support of brief.sourceSupport) {
    const source = sources.find((s) => s.id === support.sourceId);
    if (!source || !source.excerpt.includes(support.quote))
      blockers.push(`Unverified source quotation: ${support.sourceId}.`);
    if (support.publishedAt && (!source || support.publishedAt !== verifiedPublicationDate(source)))
      blockers.push(`Unverified publication date: ${support.sourceId}.`);
    if (
      support.publishedAt &&
      source &&
      support.publishedAt > source.retrievedAt.slice(0, 10)
    )
      blockers.push(
        `Publication date is after retrieval: ${support.sourceId}.`,
      );
  }
  for (const finding of brief.findings) {
    if (finding.customerEvidenceIds.some((id) => !contextIds.has(id)))
      blockers.push(`Unknown customer evidence in ${finding.dimension}.`);
    if (
      finding.sourceIds.some((id) => !sourceIds.has(id) || !supported.has(id))
    )
      blockers.push(`Unsupported citation in ${finding.dimension}.`);
    if (
      finding.basis === "supported" &&
      !finding.sourceIds.length &&
      !finding.customerEvidenceIds.length
    )
      blockers.push(`Missing support for ${finding.dimension}.`);
  }
  for (const alternative of brief.alternatives) {
    if (
      alternative.sourceIds.some(
        (id) => !sourceIds.has(id) || !supported.has(id),
      )
    )
      blockers.push("Unsupported alternative citation.");
  }
  for (const measure of brief.measures) {
    if (
      measure.customerEvidenceIds.some((id) => !contextIds.has(id)) ||
      (measure.basis === "customer_observed" &&
        !measure.customerEvidenceIds.length)
    )
      blockers.push("An observed measure requires customer evidence.");
  }
  if (
    !brief.alternatives.some((a) => a.kind === "status_quo") ||
    !brief.alternatives.some((a) => a.kind === "alternative") ||
    !brief.alternatives.some((a) => a.kind === "proposed")
  )
    blockers.push(
      "Compare the proposal, a credible alternative, and the status quo.",
    );
  if (
    sources.length < 3 ||
    new Set(sources.map((s) => new URL(s.url).hostname)).size < 2
  )
    blockers.push(
      "Research requires at least three retrieved sources from two publishers; this is an evidence floor, not proof of quality.",
    );
  if (
    brief.findings.some((f) => f.fit === "unknown" || f.fit === "incompatible")
  )
    blockers.push("Unknown or incompatible customer fit requires resolution.");
  if (
    brief.findings
      .filter((f) =>
        [
          "technology_stack",
          "delivery_processes",
          "security_and_constraints",
          "adoption_and_success",
        ].includes(f.dimension),
      )
      .some((f) => !f.customerEvidenceIds.length)
  )
    blockers.push(
      "Customer-specific prerequisites are not evidenced in every core dimension.",
    );
  if (context.journalStatus !== "available" || context.moreAvailable)
    blockers.push("Internal customer context is incomplete or inaccessible.");
  const today = now.toISOString().slice(0, 10);
  if (
    context.evidence.some(
      (e) => e.reviewAfter !== null && e.reviewAfter < today,
    )
  )
    blockers.push("Customer context includes evidence due for review.");
  if (brief.gaps.length || brief.conflicts.length)
    blockers.push("Research contains unresolved gaps or conflicts.");
  return [...new Set(blockers)];
}
