import {z} from 'zod';
import {validTimezone} from '../../reports/periods';
export const reportId=z.uuid();
export const reportDigestSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const reportAudienceSchema=z.enum(['delivery','account_team','leadership']);
export const reportCommandSchema=z.strictObject({requestKey:reportId,expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),rationale:z.string().trim().min(1).max(2000)});
export const reportSelectionSchema=z.strictObject({kind:z.enum(['weekly','monthly','quarterly']),audience:reportAudienceSchema,
 timezone:z.string().refine(validTimezone),engagementIds:z.array(reportId).min(1).max(20),workloadIds:z.array(reportId).max(20),includeCustomerLevel:z.boolean()})
 .refine(value=>new Set(value.engagementIds).size===value.engagementIds.length && new Set(value.workloadIds).size===value.workloadIds.length && (value.kind!=='weekly' || value.engagementIds.length===1));
export const reportPrepareSchema=z.strictObject({action:z.literal('prepare'),requestKey:reportId,expectedVersion:z.literal(0),selection:reportSelectionSchema,
 fromDate:z.string(),toDate:z.string(),partial:z.boolean()});
export const reportDecisionSchema=reportCommandSchema.extend({action:z.enum(['publish','reject','withdraw','send']),previewId:reportId,previewDigest:reportDigestSchema});
export const reportRevisionCommandSchema=reportCommandSchema.extend({action:z.enum(['revise','correct','render','cancel_job']),annotations:z.array(z.string().trim().min(1).max(2000)).max(20).default([]),predecessorRevisionId:reportId.optional(),jobId:reportId.optional()}).refine(value=>value.action==='cancel_job'?Boolean(value.jobId) && !value.predecessorRevisionId && value.annotations.length===0:value.action==='render'?!value.jobId && !value.predecessorRevisionId && value.annotations.length===0:value.action==='correct'?Boolean(value.predecessorRevisionId) && !value.jobId:!value.jobId);
export const reportPublicationPreviewSchema=z.strictObject({action:z.enum(['publish','reject','withdraw']),expectedVersion:z.number().int().positive().safe()});
export const reportPublicationDecisionSchema=reportCommandSchema.extend({action:z.enum(['publish','reject','withdraw']),previewId:reportId,previewDigest:reportDigestSchema});
export const reportPolicyPreviewSchema=z.strictObject({action:z.enum(['approve','pause','resume','revoke']),expectedVersion:z.number().int().positive().safe()});
export const reportPolicyDecisionSchema=reportCommandSchema.extend({action:z.enum(['approve','pause','resume','revoke']),previewId:reportId,previewDigest:reportDigestSchema});
export const reportSendPreviewSchema=z.strictObject({action:z.literal('send'),policyId:reportId,expectedVersion:z.number().int().positive().safe(),expectedPolicyVersion:z.number().int().positive().safe()});
export const reportSendDecisionSchema=reportCommandSchema.extend({action:z.literal('send'),policyId:reportId,expectedPolicyVersion:z.number().int().positive().safe(),previewId:reportId,previewDigest:reportDigestSchema});
