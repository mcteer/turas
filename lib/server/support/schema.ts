import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { citationLocatorSchema } from "../../contracts/retrieval";
import { supportActionSchema, supportAssessmentSchema, supportContractVersion, supportId, supportVersion } from "../../contracts/support";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sourceBase = { id: supportId, sourceRevisionId: supportId,
  generation: supportVersion.refine(value => value > 0), contentDigest: hash };
export const supportSourceSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceBase, kind: z.enum(["accepted_profile", "approved_excerpt", "verified_research", "shared_knowledge"]),
    locator: citationLocatorSchema, citationId: supportId.optional() }).strict(),
  z.object({ ...sourceBase, kind: z.enum(["execution_record", "milestone_baseline"]), engagementId: supportId }).strict(),
]);
export const supportSourcesSchema = z.array(supportSourceSchema).max(20).refine(values =>
  new Set(values.map(value => `${value.kind}:${value.sourceRevisionId}`)).size === values.length &&
  new Set(values.map(value => value.id)).size === values.length, "Duplicate source identity");
export const supportDependencyClosureSchema = z.array(supportSourceSchema).max(200).refine(values =>
  new Set(values.map(value => `${value.kind}:${value.sourceRevisionId}`)).size === values.length, "Duplicate dependency identity");
export const supportEngagementsSchema = z.array(supportId).max(10).refine(values => new Set(values).size === values.length, "Duplicate engagement");
const envelope = { contractVersion: z.literal(supportContractVersion), requestKey: supportId,
  workloadId: supportId.nullable(), expectedVersion: supportVersion };
const record = { recordId: supportId.optional(), audience: z.enum(["internal", "delivery"]),
  sourceRefs: supportSourcesSchema, selectedEngagementIds: supportEngagementsSchema };
export const supportCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...envelope, ...record, operation: z.literal("save_assessment"), content: supportAssessmentSchema }).strict(),
  z.object({ ...envelope, ...record, operation: z.literal("save_action"), content: supportActionSchema }).strict(),
  z.object({ ...envelope, operation: z.literal("review_revision"), recordId: supportId, revisionId: supportId,
    sourceDigest: hash, decision: z.enum(["accept", "reject"]), rationale: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...envelope, operation: z.literal("withdraw_record"), recordId: supportId, revisionId: supportId,
    sourceDigest: hash, rationale: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...envelope, operation: z.literal("save_suggestion"), attemptId: supportId, outputDigest: hash,
    suggestionIndex: z.number().int().min(0).max(4), content: supportActionSchema }).strict(),
]);
export type SupportSource = z.infer<typeof supportSourceSchema>;
export type SupportCommand = z.infer<typeof supportCommandSchema>;

export const supportListQuerySchema = z.object({
  workloadId: supportId.optional(), audience: z.enum(["internal", "delivery"]).optional(),
  kind: z.enum(["assessment", "action"]).optional(),
  disposition: z.enum(["open", "in_progress", "blocked", "deferred", "completed", "dismissed"]).optional(),
  recordId: supportId.optional(), cursor: z.string().min(1).max(4096).optional(),
  limit: z.preprocess(value => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
    z.number().int().min(1).max(50).default(20)),
}).strict().superRefine((value, ctx) => {
  if (value.recordId && (value.kind || value.disposition))
    ctx.addIssue({ code: "custom", message: "Detail and list filters are mutually exclusive" });
});

/** Transport must additionally bound bytes while reading the request stream. */
export function parseSupportCommandBody(body: string): SupportCommand {
  if (Buffer.byteLength(body, "utf8") > 65_536)
    throw new HttpFailure(413, "body_too_large", "Support request exceeds the byte limit");
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new HttpFailure(400, "invalid_input", "Malformed support request"); }
  const result = supportCommandSchema.safeParse(parsed);
  if (!result.success) throw new HttpFailure(400, "invalid_input", "Invalid support request");
  return result.data;
}
