import { z } from "zod";

const narrative = z.string().trim().min(1).max(8_000);
const title = z.string().trim().min(1).max(160);
const name = z.string().trim().min(1).max(200);
const uuid = z.uuid();
const instant = z.iso.datetime({ offset: true });
const observedInstant = instant.refine((value) => Date.parse(value) <= Date.now(), "Future observations are invalid");
const evidenceRevisionIds = z.array(uuid).max(20).default([]);
const sourceUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "A public HTTPS URL without credentials is required");

export const recordKindSchema = z.enum([
  "customer_details", "workload_details", "stakeholder", "product_use",
  "maturity_assessment", "risk", "engagement_reference", "decision",
  "outcome", "next_review", "claim",
]);
export type RecordKind = z.infer<typeof recordKindSchema>;

const dimensionKeys = z.enum([
  "outcome_ownership", "delivery_collaboration", "experience_adoption",
  "operational_trust", "platform_organization", "innovation_ai",
]);
const dimension = z.object({
  key: dimensionKeys,
  state: z.enum(["Unknown", "Emerging", "Established", "Measured", "Scaled", "Adaptive"]),
  rationale: narrative,
  evidenceRevisionIds,
  nextCapability: narrative,
}).strict().superRefine((value, ctx) => {
  if (value.state !== "Unknown" && value.evidenceRevisionIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidenceRevisionIds"], message: "Known dimensions require evidence" });
  }
});

export const profilePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("customer_details"), displayName: name, businessDescription: narrative.optional(), objectives: z.array(narrative).max(20).optional(), region: name.optional(), aliases: z.array(name).max(20).optional() }).strict(),
  z.object({ kind: z.literal("workload_details"), name, purpose: narrative, ownerReferenceId: uuid.optional(), boundaries: narrative.optional(), mergeTargetId: uuid.optional() }).strict(),
  z.object({ kind: z.literal("stakeholder"), name, role: title, responsibilities: narrative, contactDetail: title.optional(), classification: z.enum(["delivery", "internal"]).default("internal") }).strict(),
  z.object({ kind: z.literal("product_use"), productKey: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/), displayName: name, state: z.enum(["actual", "evaluating", "planned", "retired", "unknown"]), usageDescription: narrative, observedAt: observedInstant, ownerReferenceId: uuid.optional(), evidenceRevisionIds }).strict(),
  z.object({ kind: z.literal("maturity_assessment"), observationStart: observedInstant, observationEnd: observedInstant, assessor: name, rubricVersion: z.literal("customer-maturity-v1"), rationale: narrative, journeyStage: z.enum(["Explore", "Activate", "Accelerate", "Optimize", "Scale", "Transform"]).optional(), dimensions: z.array(dimension).length(6), nextCapability: narrative, reviewAt: instant, evidenceRevisionIds }).strict().superRefine((value, ctx) => {
    if (Date.parse(value.observationStart) > Date.parse(value.observationEnd)) ctx.addIssue({ code: "custom", path: ["observationStart"], message: "Observation window is reversed" });
    if (Date.parse(value.reviewAt) <= Date.parse(value.observationEnd)) ctx.addIssue({ code: "custom", path: ["reviewAt"], message: "Review must follow observation" });
    if (new Set(value.dimensions.map((entry) => entry.key)).size !== value.dimensions.length) ctx.addIssue({ code: "custom", path: ["dimensions"], message: "Dimension keys must be distinct" });
    if (value.journeyStage && value.evidenceRevisionIds.length === 0) ctx.addIssue({ code: "custom", path: ["evidenceRevisionIds"], message: "Stage requires evidence" });
  }),
  z.object({ kind: z.literal("risk"), category: title, description: narrative, owner: name, likelihood: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5), severity: z.enum(["low", "medium", "high", "critical"]), severityRationale: narrative, mitigation: narrative, status: z.enum(["open", "mitigating", "resolved", "accepted"]), observedAt: observedInstant, reviewAt: instant.optional(), evidenceRevisionIds }).strict(),
  z.object({ kind: z.literal("engagement_reference"), title, timing: z.enum(["past", "current", "future"]), startsAt: instant.optional(), endsAt: instant.optional(), referenceId: uuid.optional(), deliveryPhase: title }).strict(),
  z.object({ kind: z.literal("decision"), statement: narrative, rationale: narrative, effectiveAt: instant, accountableOwner: name, evidenceRevisionIds }).strict(),
  z.object({ kind: z.literal("outcome"), statement: narrative, measure: title.optional(), unit: title.optional(), period: title.optional(), baseline: narrative.optional(), comparison: narrative.optional(), evidenceRevisionIds }).strict(),
  z.object({ kind: z.literal("next_review"), subject: title, recordReferenceId: uuid.optional(), owner: name, dueAt: instant, action: narrative, completedAt: instant.optional() }).strict(),
  z.object({ kind: z.literal("claim"), text: narrative, title: title.optional(), sourceType: z.literal("manual"), sourceUrl: sourceUrl.optional(), sourceExcerpt: narrative.optional(), sourceMessageId: uuid.optional(), sourceSpanDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(), evidenceRevisionIds }).strict(),
]);
export type ProfilePayload = z.infer<typeof profilePayloadSchema>;
