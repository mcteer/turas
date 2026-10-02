import { z } from "zod";
import { citationLocatorSchema } from "../../contracts/retrieval";
import { Temporal } from "@js-temporal/polyfill";

export const executionId = z.uuid();
export const executionVersion = z.number().int().positive().safe();
export const executionHash = z.string().regex(/^[a-f0-9]{64}$/);
export const executionRationale = z.string().trim().min(1).max(2000);
export const executionKey = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const executionDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return Temporal.PlainDate.from(value, { overflow: "reject" }).toString() === value; } catch { return false; }
}, "A real ISO date is required");
export const executionTimezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return !/^[+-]/.test(value); } catch { return false; }
}, "An IANA timezone is required");
export const executionPeriodSchema = z.object({ from: executionDate, to: executionDate }).strict().refine(value => {
  try { const days = Temporal.PlainDate.from(value.from).until(Temporal.PlainDate.from(value.to)).days; return days >= 0 && days <= 90; }
  catch { return false; }
}, "Period must contain 1–91 inclusive dates");
export const executionExpectedVersions = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_:.-]{0,99}$/), executionVersion)
  .refine(value => Object.keys(value).length >= 1 && Object.keys(value).length <= 50);
const envelope = { version: z.literal("execution-v1"), requestKey: executionId, expectedVersions: executionExpectedVersions };
export const executionSourceSchema = z.discriminatedUnion("kind", [
  z.object({ id: executionId, kind: z.enum(["accepted_profile", "approved_excerpt", "verified_research", "shared_knowledge"]),
    sourceRevisionId: executionId, generation: executionVersion, contentDigest: executionHash,
    locator: citationLocatorSchema, citationId: executionId.optional() }).strict(),
  z.object({ id: executionId, kind: z.enum(["execution_record", "milestone_baseline"]),
    sourceRevisionId: executionId, generation: executionVersion, contentDigest: executionHash }).strict(),
]);
export const executionSourcesSchema = z.array(executionSourceSchema).max(20).refine(refs =>
  new Set(refs.map(r => `${r.kind}:${r.sourceRevisionId}`)).size === refs.length, "Duplicate source identity");
export type ExecutionSource = z.infer<typeof executionSourceSchema>;
export const executionRecordBase = {
  title: z.string().trim().min(1).max(200), narrative: z.string().trim().min(1).max(8000),
  audience: z.enum(["internal","delivery"]), eventDate: executionDate, timezone: executionTimezone,
  workPackageKey: executionKey.nullable(), milestoneKeys: z.array(executionKey).max(20).refine(a => new Set(a).size===a.length),
  ownerMembershipId: executionId.nullable(), unknownOwnerReason: z.string().trim().min(1).max(500).nullable(), references: executionSourcesSchema,
};
const activityBase = {...executionRecordBase, kind: z.literal("activity")};
export const executionRecordSchema = z.discriminatedUnion("subtype", [
  z.object({...activityBase,subtype:z.literal("work")}).strict(),
  z.object({...activityBase,subtype:z.literal("milestone_review_request"),milestoneKey:executionKey,milestoneVersion:executionVersion}).strict(),
  z.object({...activityBase,subtype:z.literal("milestone_plan"),milestoneKey:executionKey,milestoneVersion:executionVersion,
    plannedDate:executionDate.nullable(),unknownPlannedDateReason:z.string().trim().min(1).max(500).nullable()}).strict(),
]).refine(r => (r.ownerMembershipId===null)===(r.unknownOwnerReason!==null), "Choose an owner or explain unknown ownership")
  .refine(r => r.subtype!=="milestone_plan" || (r.plannedDate===null)===(r.unknownPlannedDateReason!==null), "Explain unknown planned dates");
export type ExecutionRecordContent = z.infer<typeof executionRecordSchema>;
const executionExpected = z.object({execution:executionVersion}).strict();
const recordExpected = z.object({execution:executionVersion,record:executionVersion}).strict();
const milestoneExpected = z.object({execution:executionVersion,milestone:executionVersion}).strict();
const recordIdentity = z.object({recordId:executionId,revisionId:executionId,contentDigest:executionHash}).strict();
const milestonePayload = z.object({baselineId:executionId,milestoneKey:executionKey,
  decision:z.enum(["start","block","resume","request_review","accept","waive","reopen"]),evidenceRevisionIds:z.array(executionId).max(20).refine(a => new Set(a).size===a.length)}).strict();
const reviewProof = { previewDigest:executionHash,previewExpiresAt:z.iso.datetime(),rationale:executionRationale };
const commandVariants = [
  z.object({...envelope,action:z.literal("setup"),expectedVersions:z.object({baseline:executionVersion,plan:executionVersion}).strict(),payload:z.object({baselineId:executionId}).strict()}).strict(),
  z.object({...envelope,action:z.literal("record.create"),expectedVersions:executionExpected,payload:z.object({baselineId:executionId,record:executionRecordSchema}).strict()}).strict(),
  z.object({...envelope,action:z.literal("record.revise"),expectedVersions:recordExpected,payload:z.object({recordId:executionId,record:executionRecordSchema}).strict()}).strict(),
  z.object({...envelope,action:z.literal("record.submit"),expectedVersions:recordExpected,payload:recordIdentity}).strict(),
  ...(["record.accept","record.reject","record.retract"] as const).map(action => z.object({...envelope,...reviewProof,action:z.literal(action),expectedVersions:recordExpected,payload:recordIdentity}).strict()),
  z.object({...envelope,...reviewProof,action:z.literal("milestone.decide"),expectedVersions:milestoneExpected,payload:milestonePayload}).strict(),
] as const;
export const executionCommandSchema = z.discriminatedUnion("action",commandVariants);
export type ExecutionCommand = z.infer<typeof executionCommandSchema>;
export const executionPreviewSchema = z.discriminatedUnion("action",[
  z.object({version:z.literal("execution-v1"),action:z.literal("milestone.decide"),expectedVersions:milestoneExpected,payload:milestonePayload}).strict(),
  ...(["record.accept","record.reject","record.retract"] as const).map(action => z.object({version:z.literal("execution-v1"),action:z.literal(action),expectedVersions:recordExpected,payload:recordIdentity}).strict()),
 ]);
export const executionListSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(4096).optional() }).strict();
