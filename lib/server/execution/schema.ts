import { z } from "zod";

export * from "./fields";
import { executionId, executionVersion, executionHash, executionRationale, executionKey, executionDate,
  executionTimezone, executionExpectedVersions } from "./fields";
import { timeInputSchema, timeIdentitySchema, timeBatchSchema } from "./time-schema";
const envelope = { version: z.literal("execution-v1"), requestKey: executionId, expectedVersions: executionExpectedVersions };
export * from "./record-schema";
import {activityRecordSchema} from "./record-schema";
import {raidRecordSchema,decisionRecordSchema,scopeChangeSchema,reconciliationPayloadSchema,reconciliationExpectedSchema} from "./change-schema";
export const executionRecordSchema=z.union([activityRecordSchema,raidRecordSchema,decisionRecordSchema,scopeChangeSchema]);
export type ExecutionRecordContent = z.infer<typeof executionRecordSchema>;
const executionExpected = z.object({execution:executionVersion}).strict();
const recordExpected = z.object({execution:executionVersion,record:executionVersion}).strict();
const milestoneExpected = z.object({execution:executionVersion,milestone:executionVersion}).strict();
const recordIdentity = z.object({recordId:executionId,revisionId:executionId,contentDigest:executionHash}).strict();
const milestonePayload = z.object({baselineId:executionId,milestoneKey:executionKey,
  decision:z.enum(["start","block","resume","request_review","accept","waive","reopen"]),evidenceRevisionIds:z.array(executionId).max(20).refine(a => new Set(a).size===a.length)}).strict();
const reviewProof = { previewDigest:executionHash,previewExpiresAt:z.iso.datetime(),rationale:executionRationale };
const timeExpected = z.object({execution:executionVersion,time:executionVersion}).strict();
const commandVariants = [
  z.object({...envelope,...reviewProof,action:z.literal("baseline.reconcile"),expectedVersions:reconciliationExpectedSchema,payload:reconciliationPayloadSchema}).strict(),
  z.object({...envelope,action:z.literal("time.create"),expectedVersions:executionExpected,payload:z.object({time:timeInputSchema}).strict()}).strict(),
  z.object({...envelope,action:z.literal("time.revise"),expectedVersions:timeExpected,payload:z.object({entryId:executionId,time:timeInputSchema}).strict()}).strict(),
  z.object({...envelope,action:z.literal("time.submit"),expectedVersions:timeExpected,payload:timeIdentitySchema}).strict(),
  ...(["time.approve","time.reject","time.reverse"] as const).map(action => z.object({...envelope,...reviewProof,action:z.literal(action),expectedVersions:executionExpected,
    payload: action==="time.reverse"?timeBatchSchema.refine(p=>p.entries.length===1):timeBatchSchema}).strict()),
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
  z.object({version:z.literal("execution-v1"),action:z.literal("baseline.reconcile"),expectedVersions:reconciliationExpectedSchema,payload:reconciliationPayloadSchema}).strict(),
  z.object({version:z.literal("execution-v1"),action:z.literal("milestone.decide"),expectedVersions:milestoneExpected,payload:milestonePayload}).strict(),
  ...(["time.approve","time.reject","time.reverse"] as const).map(action => z.object({version:z.literal("execution-v1"),action:z.literal(action),expectedVersions:executionExpected,
    payload:action==="time.reverse"?timeBatchSchema.refine(p=>p.entries.length===1):timeBatchSchema}).strict()),
  ...(["record.accept","record.reject","record.retract"] as const).map(action => z.object({version:z.literal("execution-v1"),action:z.literal(action),expectedVersions:recordExpected,payload:recordIdentity}).strict()),
 ]);
export const executionListSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(4096).optional() }).strict();
