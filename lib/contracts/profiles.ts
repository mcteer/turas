import { z } from "zod";
import { profilePayloadSchema, type RecordKind } from "./profile-payloads";

const uuid = z.uuid();
const rationale = z.string().trim().min(1).max(2_000);
const score = z.number().int().min(0).max(4);
const sourceUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});
const qualityInputFields = z.object({
  rubricVersion: z.literal("evidence-quality-v1"),
  R: score, D: score, C: score,
  reliabilityRationale: rationale,
  directnessRationale: rationale,
  corroborationRationale: rationale,
  informationType: z.enum(["account_status", "product_availability", "product_capability", "adoption_process", "architecture", "unknown"]),
  dateBasis: z.enum(["observation", "publication", "unknown"]),
  dateSourceRevisionId: uuid.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.dateBasis === "unknown" && value.dateSourceRevisionId) ctx.addIssue({ code: "custom", path: ["dateSourceRevisionId"], message: "Unknown date cannot cite evidence" });
});
export const unknownQualityInput = {
  rubricVersion: "evidence-quality-v1", R: 0, D: 0, C: 0,
  reliabilityRationale: "Missing reliability input",
  directnessRationale: "Missing directness input",
  corroborationRationale: "Missing corroboration input",
  informationType: "unknown", dateBasis: "unknown",
} as const;
export const qualityInputSchema = qualityInputFields;
const qualityInput = qualityInputSchema.default(unknownQualityInput);
const audience = z.enum(["internal", "delivery"]);
const category = z.enum(["delivery_context", "internal_operations", "commercial", "personnel", "other_internal"]);
const base = { requestKey: uuid };
const proposal = {
  workloadId: uuid.nullish(), payload: profilePayloadSchema,
  qualityInput, requestedAudience: audience.default("internal"), dataCategory: category.default("other_internal"),
  sourceUrl: sourceUrl.optional(), sourceExcerpt: z.string().max(8_000).optional(),
  evidenceRevisionIds: z.array(uuid).max(20).default([]),
};
export const profileCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("propose_record"), ...proposal }).strict(),
  z.object({ ...base, action: z.literal("propose_revision"), recordId: uuid, expectedRecordVersion: z.number().int().nonnegative(), expectedAcceptedRevisionId: uuid.nullable(), ...proposal }).strict(),
  z.object({ ...base, action: z.literal("propose_workload"), payload: profilePayloadSchema, qualityInput }).strict(),
  z.object({ ...base, action: z.literal("accept_revision"), revisionId: uuid, digest: z.string().regex(/^[0-9a-f]{64}$/), expectedRecordVersion: z.number().int().nonnegative(), expectedAcceptedRevisionId: uuid.nullable(), rationale, partnerSafeReason: rationale.optional(), partnerSafeAttestation: rationale.optional(), acknowledgeOlderObservation: z.boolean().default(false) }).strict(),
  z.object({ ...base, action: z.literal("reject_revision"), revisionId: uuid, expectedRecordVersion: z.number().int().nonnegative(), rationale, partnerSafeReason: rationale.optional() }).strict(),
  z.object({ ...base, action: z.literal("request_retraction"), revisionId: uuid, expectedRecordVersion: z.number().int().nonnegative(), reason: rationale }).strict(),
  z.object({ ...base, action: z.literal("retract_revision"), revisionId: uuid, expectedRecordVersion: z.number().int().nonnegative(), rationale, requestId: uuid.optional() }).strict(),
  z.object({ ...base, action: z.literal("withdraw_source"), sourceRevisionId: uuid, expectedLifecycleVersion: z.number().int().nonnegative(), rationale }).strict(),
  z.object({ ...base, action: z.literal("decline_retraction"), requestId: uuid, expectedVersion: z.number().int().nonnegative(), rationale, partnerSafeReason: rationale.optional() }).strict(),
  z.object({ ...base, action: z.enum(["assign_steward", "revoke_steward"]), membershipId: uuid, expectedAssignmentVersion: z.number().int().nonnegative(), rationale }).strict(),
  z.object({ ...base, action: z.literal("flag_conflict"), firstRevisionId: uuid, secondRevisionId: uuid, reason: rationale }).strict(),
  z.object({ ...base, action: z.enum(["confirm_conflict", "resolve_conflict"]), conflictId: uuid, expectedVersion: z.number().int().nonnegative(), rationale, resolutionRevisionIds: z.array(uuid).max(20).optional() }).strict(),
]).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value)) > 65_536) ctx.addIssue({ code: "custom", message: "Command body exceeds 64 KiB" });
  if (value.action === "propose_workload" && value.payload.kind !== "workload_details") ctx.addIssue({ code: "custom", path: ["payload"], message: "Workload details required" });
  if ("payload" in value && Buffer.byteLength(JSON.stringify(value.payload)) > 32_768) ctx.addIssue({ code: "custom", path: ["payload"], message: "Payload exceeds 32 KiB" });
});
export type ProfileCommand = z.infer<typeof profileCommandSchema>;
export function canonicalRecordKey(kind: RecordKind, workloadId: string | null, payload: { kind: RecordKind; productKey?: string }): string | null {
  switch (kind) {
    case "customer_details": return "customer_details";
    case "workload_details": return workloadId ? workloadId : null;
    case "product_use": return payload.kind === "product_use" ? payload.productKey ?? null : null;
    case "maturity_assessment": return "maturity_assessment";
    default: return null;
  }
}


export const profileListQuerySchema = z.object({
  kind: z.enum(["customer_details", "workload_details", "stakeholder", "product_use", "maturity_assessment", "risk", "engagement_reference", "decision", "outcome", "next_review", "claim"]).optional(),
  workloadId: uuid.optional(),
  state: z.enum(["pending", "accepted", "rejected", "superseded", "retracted"]).optional(),
  query: z.string().max(200).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

export const profileQualityDtoSchema = z.object({
  rubricVersion: z.literal("evidence-quality-v1"), R: score, F: score,
  D: score, C: score, Q: z.number().int().min(0).max(100),
  band: z.enum(["strong", "usable", "weak", "insufficient"]),
  freshness: z.enum(["Recent", "Aging", "Stale", "Unknown"]),
  asOf: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
}).strict();
const revisionDtoBase = {
  id: uuid, recordId: uuid, kind: z.string(), workloadId: uuid.nullable(),
  reviewState: z.enum(["pending", "accepted", "rejected", "superseded", "retracted"]),
  payload: profilePayloadSchema,
  quality: profileQualityDtoSchema,
  createdAt: z.iso.datetime({ offset: true }).optional(),
  recordVersion: z.number().int().nonnegative().optional(),
  supportStatus: z.enum(["settled", "unsupported", "conflicted", "restricted_source"]).optional(),
};
export const internalProfileRevisionDtoSchema = z.object({
  ...revisionDtoBase, qualityInput: qualityInputSchema,
  audience: z.enum(["internal", "delivery"]),
  dataCategory: z.enum(["delivery_context", "internal_operations", "commercial", "personnel", "other_internal"]),
  sourceReferences: z.array(uuid).max(20), authorMembershipId: uuid,
  decisionRationale: z.string().nullable(), candidateSequence: z.number().int().positive(),
}).strict();
export const partnerProfileRevisionDtoSchema = z.object({
  ...revisionDtoBase, sourceStatus: z.literal("restricted").optional(),
  sourceAttestation: z.string().optional(), partnerSafeReason: z.string().nullable().optional(),
}).strict();
export const profileRevisionDtoSchema = z.union([
  internalProfileRevisionDtoSchema, partnerProfileRevisionDtoSchema,
]);
