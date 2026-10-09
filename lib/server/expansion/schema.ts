import { z } from "zod";
import { citationLocatorSchema } from "../../contracts/retrieval";
import { expansionContractVersion, expansionDate, expansionDigest, expansionDisposition, expansionHypothesisSchema, expansionId, expansionVersion } from "../../contracts/expansion";
const distinct=<T>(v:T[])=>new Set(v).size===v.length;
const base={id:expansionId,sourceRevisionId:expansionId,generation:expansionVersion.refine(v=>v>0),contentDigest:expansionDigest};
export const expansionSourceSchema=z.discriminatedUnion("kind",[
  z.object({...base,kind:z.enum(["accepted_profile","approved_excerpt","verified_research","shared_knowledge"]),locator:citationLocatorSchema,citationId:expansionId.optional()}).strict(),
  z.object({...base,kind:z.enum(["execution_record","milestone_baseline"]),engagementId:expansionId}).strict(),
]);
export const expansionSourcesSchema=z.array(expansionSourceSchema).max(20).refine(v=>distinct(v.map(x=>x.id))&&distinct(v.map(x=>`${x.kind}:${x.sourceRevisionId}`)),"Duplicate source");
export const expansionEngagementsSchema=z.array(expansionId).max(10).refine(distinct,"Duplicate engagement");
export const expansionLinkSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("plan_revision"),planId:expansionId,revisionId:expansionId}).strict(),
  z.object({kind:z.literal("engagement"),engagementId:expansionId,baselineId:expansionId,generation:expansionVersion}).strict(),
  z.object({kind:z.literal("milestone_baseline"),engagementId:expansionId,baselineId:expansionId,revisionId:expansionId}).strict(),
]);
export const expansionLinksSchema=z.array(expansionLinkSchema).max(10).refine(v=>distinct(v.map(x=>JSON.stringify(x))),"Duplicate link");
const envelope={contractVersion:z.literal(expansionContractVersion),requestKey:expansionId,workloadId:expansionId.nullable(),expectedVersion:expansionVersion};
export const expansionDuplicateSchema=z.object({relatedSetDigest:expansionDigest,rationale:z.string().trim().min(1).max(2000)}).strict();
const author={content:expansionHypothesisSchema,sourceRefs:expansionSourcesSchema,selectedEngagementIds:expansionEngagementsSchema,deliveryLinks:expansionLinksSchema,duplicateAcknowledgement:expansionDuplicateSchema.optional()};
export const expansionCommandSchema=z.discriminatedUnion("operation",[
  z.object({...envelope,...author,operation:z.literal("save_hypothesis"),recordId:expansionId.optional()}).strict(),
  z.object({...envelope,operation:z.literal("decide_hypothesis"),recordId:expansionId,revisionId:expansionId,decision:z.enum(["qualify","defer","dismiss","reopen"]),rationale:z.string().trim().min(1).max(2000),previewDigest:expansionDigest,expectedAssignmentVersion:expansionVersion,revisitDate:expansionDate.optional()}).strict(),
  z.object({...envelope,...author,operation:z.literal("save_suggestion"),attemptId:expansionId,outputDigest:expansionDigest,suggestionIndex:z.number().int().min(0).max(4)}).strict(),
]);
export const expansionOwnerCommandSchema=z.object({contractVersion:z.literal(expansionContractVersion),operation:z.literal("assign_owner"),requestKey:expansionId,expectedVersion:expansionVersion,membershipId:expansionId.nullable(),rationale:z.string().trim().min(1).max(2000)}).strict();
export const expansionPreviewSchema=z.object({workloadId:expansionId.nullable(),recordId:expansionId,revisionId:expansionId,kind:z.enum(["full","metadata"]).default("full")}).strict();
export const expansionListSchema=z.object({workloadId:expansionId.optional(),recordId:expansionId.optional(),revisionId:expansionId.optional(),disposition:expansionDisposition.optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().min(1).max(4096).optional()}).strict().refine(v=>(!v.recordId||!v.disposition)&&(!v.revisionId||!!v.recordId),"Detail filters invalid");
export type ExpansionSource=z.infer<typeof expansionSourceSchema>;
export type ExpansionCommand=z.infer<typeof expansionCommandSchema>;
export type ExpansionLink=z.infer<typeof expansionLinkSchema>;
export type ExpansionSaveCommand=Extract<ExpansionCommand,{operation:"save_hypothesis"}>;

export const expansionEvidenceQuerySchema=z.object({workloadId:expansionId.optional(),query:z.string().trim().min(1).max(500),limit:z.coerce.number().int().min(1).max(10).default(10)}).strict();
