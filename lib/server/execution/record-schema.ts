import {z} from "zod";
import {citationLocatorSchema} from "../../contracts/retrieval";
import {executionId,executionVersion,executionHash,executionKey,executionDate,executionTimezone} from "./fields";
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
export const activityRecordSchema = z.discriminatedUnion("subtype", [
  z.object({...activityBase,subtype:z.literal("work")}).strict(),
  z.object({...activityBase,subtype:z.literal("milestone_review_request"),milestoneKey:executionKey,milestoneVersion:executionVersion}).strict(),
  z.object({...activityBase,subtype:z.literal("milestone_plan"),milestoneKey:executionKey,milestoneVersion:executionVersion,
    plannedDate:executionDate.nullable(),unknownPlannedDateReason:z.string().trim().min(1).max(500).nullable()}).strict(),
]).refine(r => (r.ownerMembershipId===null)===(r.unknownOwnerReason!==null), "Choose an owner or explain unknown ownership")
  .refine(r => r.subtype!=="milestone_plan" || (r.plannedDate===null)===(r.unknownPlannedDateReason!==null), "Explain unknown planned dates");
