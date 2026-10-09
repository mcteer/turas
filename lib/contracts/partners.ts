import { z } from "zod";
import { citationLocatorSchema,evidenceQualitySchema,utcTimestampSchema } from "./retrieval";
export const partnerContractVersion = "partner-enablement-v1" as const;
export const partnerId = z.uuid();
export const partnerVersion = z.number().int().nonnegative().safe();
export const partnerDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const partnerRationale = z.string().trim().refine(v=>Array.from(v).length>=1&&Array.from(v).length<=2000,"Use 1–2000 characters");
export const partnerPageQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().refine(v=>Array.from(v).length<=200,"Use at most 200 characters").default(""), cursor: partnerId.optional() }).strict();
export type PartnerPageInput = z.infer<typeof partnerPageQuery>;
export type PartnerCommandBase = { action: string; requestId: string; expectedVersion: number };
export type PartnerReceipt = { contractVersion: typeof partnerContractVersion; requestId: string; action: string;
  targetId: string | null; version: number | null; outcome: "committed" | "abandoned" | "retired"; committedAt: string | null };
export type PartnerAvailability = "eligible" | "obsolete" | "authority_changed" | "source_unavailable" | "purged" | "retired" | "withdrawn";
export type PartnerPage<T> = { contractVersion: typeof partnerContractVersion; items: T[]; hasMore: boolean; nextCursor: string | null };

const text=(max:number)=>z.string().trim().refine(v=>Array.from(v).length>=1&&Array.from(v).length<=max,`Use 1–${max} characters`);
const distinct=(values:readonly string[])=>new Set(values).size===values.length;
export const partnerSourceSchema=z.object({id:partnerId,kind:z.enum(["accepted_profile","approved_excerpt","verified_research","shared_knowledge","accepted_execution"]),sourceRevisionId:partnerId,generation:partnerVersion.refine(v=>v>0),contentDigest:partnerDigest,
 locator:citationLocatorSchema.optional(),engagementId:partnerId.optional(),classification:z.enum(["customer_fact","product_evidence","shared_practice","demonstration"]),
 observationAt:utcTimestampSchema.nullable(),publicationAt:utcTimestampSchema.nullable(),reviewAt:utcTimestampSchema.nullable(),quality:evidenceQualitySchema}).strict().superRefine((value,ctx)=>{
 if(value.kind==="accepted_execution"?(!value.engagementId||value.locator!==undefined):(!value.locator||value.engagementId!==undefined))ctx.addIssue({code:"custom",message:"Exact source locator and scope required"});
 if(value.classification==="customer_fact"&&!["accepted_profile","approved_excerpt"].includes(value.kind))ctx.addIssue({code:"custom",message:"Customer facts require accepted customer evidence"});
 if(value.classification==="shared_practice"&&value.kind!=="shared_knowledge")ctx.addIssue({code:"custom",message:"Shared practice requires a published shared source"});
});
export type PartnerSource=z.infer<typeof partnerSourceSchema>;
export const partnerSourcesSchema=z.array(partnerSourceSchema).max(20).refine(v=>distinct(v.map(r=>r.id))&&distinct(v.map(r=>`${r.kind}:${r.sourceRevisionId}`)),"Duplicate source");
const mappings=z.array(partnerId).min(1).max(20).refine(distinct,"Duplicate mapping");
export const partnerLessonSchema=z.object({id:partnerId,order:z.number().int().min(1).max(20),objective:text(2000),what:text(2000),how:text(2000),why:text(2000),alternatives:text(2000),limitations:text(2000),validation:text(2000),escalation:text(2000),prerequisites:z.array(text(500)).max(10),unknowns:z.array(text(500)).max(10),sourceIds:mappings}).strict();
export const partnerCheckpointSchema=z.object({id:partnerId,lessonId:partnerId,order:z.number().int().min(1).max(40),title:text(200),criterion:text(2000),required:z.boolean(),prerequisiteIds:z.array(partnerId).max(10).refine(distinct),sourceIds:mappings}).strict();
export const partnerGuideContentSchema=z.object({title:text(200),lessons:z.array(partnerLessonSchema).min(1).max(20),checkpoints:z.array(partnerCheckpointSchema).min(1).max(40),sources:partnerSourcesSchema.refine(v=>v.length>=1&&v.every(r=>r.kind!=="accepted_execution"),"Guide original evidence required")}).strict().superRefine((content,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:"custom",message});
 if(new TextEncoder().encode(JSON.stringify(content)).byteLength>131072)issue("Guide content exceeds 128 KiB");
 if(!distinct(content.lessons.map(l=>l.id))||!distinct(content.checkpoints.map(c=>c.id)))issue("Duplicate lesson or checkpoint identity");
 for(const list of [content.lessons,content.checkpoints])if(list.some((item,index)=>item.order!==index+1))issue("Order must be contiguous from one");
 const sourceIds=new Set(content.sources.map(s=>s.id)),used=new Set<string>(),lessons=new Set(content.lessons.map(l=>l.id)),checkpoints=new Map(content.checkpoints.map(c=>[c.id,c]));
 for(const item of [...content.lessons,...content.checkpoints])for(const id of item.sourceIds){if(!sourceIds.has(id))issue("Unknown source mapping");used.add(id);}
 if([...sourceIds].some(id=>!used.has(id)))issue("Every selected source must support a lesson or checkpoint");
 if(!content.checkpoints.some(c=>c.required))issue("At least one required checkpoint is needed");
 for(const checkpoint of content.checkpoints){if(!lessons.has(checkpoint.lessonId))issue("Checkpoint must belong to one lesson");for(const id of checkpoint.prerequisiteIds){const prerequisite=checkpoints.get(id);if(!prerequisite||checkpoint.required&&!prerequisite.required)issue("Invalid prerequisite");}}
 const visiting=new Set<string>(),done=new Set<string>();const visit=(id:string):void=>{if(visiting.has(id)){issue("Checkpoint prerequisites must be acyclic");return;}if(done.has(id))return;visiting.add(id);for(const next of checkpoints.get(id)?.prerequisiteIds??[])visit(next);visiting.delete(id);done.add(id);};for(const id of checkpoints.keys())visit(id);
});
export type PartnerGuideContent=z.infer<typeof partnerGuideContentSchema>;
export const partnerEnvelope={contractVersion:z.literal(partnerContractVersion),requestId:partnerId,expectedVersion:partnerVersion};
const createGuide=z.object({...partnerEnvelope,action:z.literal("guide.create"),customerId:partnerId,engagementId:partnerId,acceptedRevisionId:partnerId,baselineId:partnerId,content:partnerGuideContentSchema}).strict().refine(v=>v.expectedVersion===0,"Creation starts at zero");
const reviseGuide=z.object({...partnerEnvelope,action:z.literal("guide.revise"),guideId:partnerId,acceptedRevisionId:partnerId,baselineId:partnerId,content:partnerGuideContentSchema}).strict();
const submitGuide=z.object({...partnerEnvelope,action:z.literal("guide.submit"),guideId:partnerId,revisionId:partnerId,contentDigest:partnerDigest}).strict();
export const partnerGuideDraftCommandSchema=z.discriminatedUnion("action",[createGuide,reviseGuide,submitGuide]);
export const partnerGuideReviewSchema=z.object({...partnerEnvelope,action:z.enum(["guide.publish","guide.reject","guide.retire"]),guideId:partnerId,revisionId:partnerId,contentDigest:partnerDigest,rationale:text(2000),selfReview:z.boolean()}).strict();
export const partnerGuideReviewCommandSchema=partnerGuideReviewSchema.extend({previewId:partnerId}).strict();
export type PartnerGuideDraftCommand=z.infer<typeof partnerGuideDraftCommandSchema>;
export type PartnerGuideReviewInput=z.infer<typeof partnerGuideReviewSchema>;

export const partnerAssignmentCreateSchema=z.object({...partnerEnvelope,action:z.literal("assignment.create"),guideId:partnerId,revisionId:partnerId,membershipId:partnerId,rationale:text(2000),selfReview:z.boolean()}).strict().refine(v=>v.expectedVersion===0,"Creation starts at zero");
export const partnerAssignmentWithdrawSchema=z.object({...partnerEnvelope,action:z.literal("assignment.withdraw"),assignmentId:partnerId,rationale:text(2000),selfReview:z.boolean()}).strict();
export const partnerAssignmentReplaceSchema=z.object({...partnerEnvelope,action:z.literal("assignment.replace"),assignmentId:partnerId,guideId:partnerId,revisionId:partnerId,rationale:text(2000),selfReview:z.boolean()}).strict();
export const partnerAssignmentReviewSchema=z.discriminatedUnion("action",[partnerAssignmentCreateSchema,partnerAssignmentWithdrawSchema,partnerAssignmentReplaceSchema]);
export const partnerAssignmentCommandSchema=z.discriminatedUnion("action",[partnerAssignmentCreateSchema.safeExtend({previewId:partnerId}),partnerAssignmentWithdrawSchema.extend({previewId:partnerId}),partnerAssignmentReplaceSchema.extend({previewId:partnerId})]);
export type PartnerAssignmentInput=z.infer<typeof partnerAssignmentReviewSchema>;
export const partnerAttemptContentSchema=z.object({attempted:text(4000),result:text(4000),blockers:z.array(text(500)).max(10),observedAt:utcTimestampSchema.refine(v=>Date.parse(v)<=Date.now(),"Observation cannot be in the future"),sources:partnerSourcesSchema}).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).byteLength<=131072,"Attempt content exceeds 128 KiB");
export type PartnerAttemptContent=z.infer<typeof partnerAttemptContentSchema>;
const checkpointSave=z.object({...partnerEnvelope,action:z.literal("checkpoint.save"),assignmentId:partnerId,checkpointId:partnerId,content:partnerAttemptContentSchema}).strict();
const checkpointSubmit=z.object({...partnerEnvelope,action:z.literal("checkpoint.submit"),assignmentId:partnerId,checkpointId:partnerId,attemptId:partnerId,revisionId:partnerId,contentDigest:partnerDigest}).strict();
export const partnerCheckpointCommandSchema=z.discriminatedUnion("action",[checkpointSave,checkpointSubmit]);
export const partnerCheckpointReviewSchema=z.object({...partnerEnvelope,action:z.enum(["checkpoint.verify","checkpoint.request_changes"]),assignmentId:partnerId,checkpointId:partnerId,attemptId:partnerId,revisionId:partnerId,contentDigest:partnerDigest,rationale:text(2000),selfReview:z.boolean()}).strict();
export const partnerCheckpointDecisionSchema=partnerCheckpointReviewSchema.extend({previewId:partnerId});
export type PartnerCheckpointReviewInput=z.infer<typeof partnerCheckpointReviewSchema>;
