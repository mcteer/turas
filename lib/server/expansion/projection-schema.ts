import {z} from 'zod';
import {expansionContractVersion,expansionDigest,expansionDate,expansionDisposition,expansionHypothesisSchema,expansionId,expansionVersion} from '../../contracts/expansion';
import {expansionDuplicateSchema,expansionEngagementsSchema,expansionLinksSchema,expansionSourcesSchema} from './schema';
import {HttpFailure} from '../../contracts/http';
const timestamp=z.iso.datetime();
const name=z.string().min(1).max(200);
const payloadFields={content:expansionHypothesisSchema,sourceRefs:expansionSourcesSchema,selectedEngagementIds:expansionEngagementsSchema,deliveryLinks:expansionLinksSchema};
export const expansionRetainedPayloadSchema=z.object({...payloadFields,duplicateAcknowledgement:expansionDuplicateSchema.nullable().optional()}).strict();
export const expansionProjectedPayloadSchema=z.object(payloadFields).strict();
export const expansionRevisionProjectionSchema=z.object({availability:z.enum(['missing','purged','changed','eligible']),payload:expansionProjectedPayloadSchema.nullable()}).strict()
 .refine(value=>(value.availability==='eligible')===(value.payload!==null),'Withheld revisions cannot release prose');
export const expansionReceiptSchema=z.object({id:expansionId,operation:z.enum(['save_hypothesis','save_suggestion','decide_hypothesis','assign_owner']),customerId:expansionId,
 recordId:expansionId.nullable(),revisionId:expansionId.nullable(),decisionId:expansionId.nullable(),outcome:z.enum(['proposed','qualified','deferred','dismissed','assigned','unassigned']),version:expansionVersion}).strict()
 .refine(value=>value.operation==='assign_owner'?['assigned','unassigned'].includes(value.outcome):value.operation==='decide_hypothesis'?['proposed','qualified','deferred','dismissed'].includes(value.outcome):value.outcome==='proposed','Invalid receipt outcome');
export const expansionRankingProjectionSchema=z.discriminatedUnion('kind',[
 z.object({version:z.literal('expansion-ranking-v1'),kind:z.literal('active'),categories:z.object({review:z.enum(['required','current']),benefit:z.enum(['measurable_target','qualitative_outcome','unknown']),prerequisite:z.enum(['satisfied','validation_needed','blocked','unknown']),evidence:z.enum(['qualification_supported','discovery_only','unavailable']),nextReviewDate:expansionDate.nullable()}).strict(),tuple:z.tuple([z.number().int().min(0).max(1),z.number().int().min(0).max(2),z.number().int().min(0).max(3),z.number().int().min(0).max(2),expansionDate,timestamp,expansionId])}).strict(),
 z.object({version:z.literal('expansion-ranking-v1'),kind:z.literal('paused'),categories:z.object({revisitDate:expansionDate.nullable(),decisionAt:timestamp.nullable()}).strict(),tuple:z.tuple([expansionDate,timestamp,expansionId])}).strict(),
]);
export const expansionRecordProjectionSchema=z.object({ranking:expansionRankingProjectionSchema,id:expansionId,version:expansionVersion.refine(value=>value>0),workingRevisionId:expansionId,decidedRevisionId:expansionId.nullable(),
 disposition:expansionDisposition,createdAt:timestamp,lastDecision:z.object({id:expansionId,action:z.enum(['qualify','defer','dismiss','reopen']),reviewerMembershipId:expansionId,reviewerName:name,assignmentVersion:expansionVersion,createdAt:timestamp,revisitDate:expansionDate.nullable(),rationale:z.string().min(1).max(2000).nullable()}).strict().nullable(),working:expansionRevisionProjectionSchema,decided:expansionRevisionProjectionSchema,reviewRequired:z.boolean(),
 reviewReasons:z.array(z.string().min(1).max(200)).max(20),allowedActions:z.array(z.enum(['qualify','defer','dismiss','reopen'])).max(4),
 history:z.object({revisions:z.array(z.object({id:expansionId,ordinal:expansionVersion.refine(value=>value>0),createdAt:timestamp,contentRetained:z.boolean()}).strict()).max(50),nextCursor:z.string().max(4096).nullable(),selected:expansionRevisionProjectionSchema.nullable()}).strict().nullable(),
}).strict().refine(value=>value.working.availability==='eligible'||value.ranking.kind==='paused'||value.ranking.categories.benefit==='unknown'&&value.ranking.categories.prerequisite==='unknown'&&value.ranking.categories.evidence==='unavailable'&&value.ranking.categories.nextReviewDate===null,'Withheld revisions cannot expose stale ranking inputs');
export const expansionWorkspaceProjectionSchema=z.object({contractVersion:z.literal(expansionContractVersion),receiptNamespace:expansionDigest,commandNamespace:expansionDigest,customerId:expansionId,workloadId:expansionId.nullable(),scopeGeneration:expansionVersion,
 metadata:z.object({customerName:name,workloads:z.array(z.object({id:expansionId,name}).strict()).max(100),owners:z.array(z.object({id:expansionId,name}).strict()).max(100)}).strict(),
 assignment:z.object({membershipId:expansionId.nullable(),version:expansionVersion,generation:expansionVersion,active:z.boolean()}).strict().refine(value=>!value.active||value.membershipId!==null),
 canManageOwner:z.boolean(),records:z.array(expansionRecordProjectionSchema).max(50),nextCursor:z.string().max(4096).nullable(),
}).strict();
export function expansionOutput<T>(schema:z.ZodType<T>,value:unknown):T{
 const parsed=schema.safeParse(value);if(!parsed.success)throw new HttpFailure(503,'projection_unavailable','Expansion projection unavailable');return parsed.data;
}
