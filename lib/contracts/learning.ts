import { z } from 'zod';
import { knowledgeLineageSchema, sanitizedKnowledgeSchema } from './knowledge';
import { governedIdSchema, sha256Schema, utcTimestampSchema } from './retrieval';

export const learningVersion = 'learning-v1' as const;
export const learningEvaluationVersion = 'learning-evaluation-v1' as const;
export const learningRubricVersion = 'learning-rubric-v2' as const;
export const learningMetricsVersion = 'learning-metrics-v1' as const;
export const learningId = governedIdSchema;
export const learningGeneration = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const text = (max = 2000) => z.string().trim().min(1).max(max);
const uniqueIds = (max: number) => z.array(learningId).max(max).refine(a => new Set(a).size === a.length, 'Duplicate identity');
export const learningLimits = Object.freeze({
  feedbackBytes: 16384, candidateBytes: 20480, pageBytes: 131072, armBytes: 65536,
  list: 20, cursor: 512, search: 200, draftSteps: 6, draftReads: 6, dependencies: 200,
  inputBytes: 24576, requestedOutputTokens: 4096, observedOutputTokens: 8192,
  dispatchMs: 120000, preparationMs: 300000, cases: 8, arms: 16, batchMs: 2400000,
  maximumBudgetMicroUsd: 25000000n, minimumCustomers: 5, maximumContributions: 10000,
  maintenanceBatch: 100, maintenanceMs: 10000, maintenanceIntervalMs: 60000,
  writeActor: 30, writeWorkspace: 120, obsoleteDays: 90, invalidatedHours: 24, metadataDays: 365,
});
export function serializedBytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)).length; }
const bounded = <T extends z.ZodType>(schema: T, bytes: number) => schema.refine(value => serializedBytes(value) <= bytes, 'Serialized payload is too large');
export const learningEnvelope = {
  contractVersion: z.literal(learningVersion), requestId: learningId,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
};
export const learningTargetSchema = z.object({
  kind: z.enum(['shared_practice', 'report', 'gap_observation', 'partner_guide', 'own_checkpoint']),
  id: learningId, revisionId: learningId, generation: learningGeneration, digest: sha256Schema,
}).strict();
export const learningFeedbackCategories = ['unclear', 'stale', 'ineffective', 'correction', 'missing_guidance'] as const;
export const learningFeedbackSchema = bounded(z.object({
  ...learningEnvelope, expectedVersion: z.literal(0), target: learningTargetSchema,
  category: z.enum(learningFeedbackCategories), text: text(),
}).strict(), learningLimits.feedbackBytes);
export const learningFeedbackRevisionSchema = bounded(z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, text: text(),
}).strict(), learningLimits.feedbackBytes);
export const learningDispositionSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration,
  state: z.enum(['open', 'under_review', 'linked', 'deferred', 'dismissed']), rationale: text(),
  candidateRevisionId: learningId.optional(),
}).strict().refine(v => (v.state === 'linked') === Boolean(v.candidateRevisionId), 'Linked disposition requires exactly one candidate');
export const learningListSchema = z.object({
  cursor: z.string().min(1).max(512).optional(), limit: z.coerce.number().int().min(1).max(20).default(20),
  search: z.string().trim().max(200).default(''),
}).strict();
export const microUsdSchema = z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/)
  .pipe(z.string().refine(v => decimalMicro(v) > 0n && decimalMicro(v) <= 25000000n, 'Budget must be greater than zero and at most 25 USD'));
export function decimalMicro(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) throw new Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export const learningDraftSchema = bounded(z.object({
  ...learningEnvelope, expectedVersion: z.literal(0), customerId: learningId,
  lineage: z.array(knowledgeLineageSchema).min(1).max(20).refine(a => new Set(a.map(v => `${v.sourceKind}:${v.sourceRevisionId}`)).size === a.length, 'Duplicate original'),
  feedbackIds: uniqueIds(10).default([]), publicationId: learningId.optional(),
  question: text(), budgetUsd: microUsdSchema,
}).strict(), learningLimits.inputBytes);
export const learningDraftOutputSchema = bounded(z.object({
  contractVersion: z.literal(learningVersion), proposal: sanitizedKnowledgeSchema,
  citationKeys: z.array(text(80)).min(1).max(20).refine(a => new Set(a).size === a.length),
  unknowns: z.array(text(500)).max(20), intendedImprovement: text(),
}).strict(), 32768);
export const learningDraftSaveSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, outputDigest: sha256Schema,
  proposalIndex: z.literal(0), payload: sanitizedKnowledgeSchema,
}).strict();
export const learningSanitizationSchema = z.object({
  namesAndDomainsRemoved: z.literal(true), repositoriesAndLinksRemoved: z.literal(true),
  peopleAndCommercialDetailsRemoved: z.literal(true), identifyingConfigurationAndOutcomesRemoved: z.literal(true),
  countsAndCombinedInferenceReviewed: z.literal(true),
}).strict();
export const learningCandidateReviewSchema = z.discriminatedUnion('decision', [
  z.object({ ...learningEnvelope, expectedVersion: learningGeneration, revisionId: learningId,
    contentDigest: sha256Schema, closureDigest: sha256Schema, decision: z.literal('accept'),
    rightsAttested: z.literal(true), checklist: learningSanitizationSchema, rationale: text() }).strict(),
  z.object({ ...learningEnvelope, expectedVersion: learningGeneration, revisionId: learningId,
    contentDigest: sha256Schema, closureDigest: sha256Schema, decision: z.literal('reject'), rationale: text() }).strict(),
]);
export const learningEvaluationSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, reviewId: learningId,
  baselineGeneration: learningGeneration.nullable(), catalogDigest: sha256Schema, budgetUsd: microUsdSchema,
}).strict();
export const learningArmSchema = z.enum(['baseline', 'candidate']);
export const learningPurposeSchema = z.enum(['draft', 'evaluation_baseline', 'evaluation_candidate']);
export const learningArmOutputSchema = bounded(z.object({
  kind: z.enum(['answer', 'abstain']), text: text(12000),
  citationKeys: z.array(text(80)).max(20).refine(a => new Set(a).size === a.length, 'Duplicate citation'),
  unknowns: z.array(text(500)).max(20),
}).strict(), 65536);
export const learningScoresSchema = z.object({
  fidelity: z.number().int().min(0).max(2), applicability: z.number().int().min(0).max(2),
  unknownHandling: z.number().int().min(0).max(2), usefulness: z.number().int().min(0).max(2),
}).strict();
export const learningCaseReviewSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, caseId: text(80),
  baselineCaptureDigest: sha256Schema, candidateCaptureDigest: sha256Schema,
  baseline: learningScoresSchema, candidate: learningScoresSchema,
  safetyPassed: z.boolean(), citationPassed: z.boolean(), authorityPassed: z.boolean(), rationale: text(),
}).strict();
export const learningSettlementSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, reservationId: learningId,
  kind: z.enum(['actual', 'conservative_bound']), usd: z.string().max(24).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/).pipe(z.string().refine(v=>decimalMicro(v)<=9223372036854775807n,'Cost exceeds the accounting range')),
  inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  providerGenerationId: text(200).nullable(), evidence: text(), rationale: text(),
}).strict();
export const learningRollbackSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, historicalRevisionId: learningId,
  lineage: z.array(knowledgeLineageSchema).min(1).max(20), rationale: text(),
}).strict();
export const learningMetricSchema = z.enum(['deployment_lead_time', 'change_failure_rate']);
export const learningQuarterSchema = z.string().regex(/^20\d{2}-Q[1-4]$/);
export const learningMeasurementValueSchema = z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/)
  .pipe(z.string().refine(v => decimalMicro(v) <= 1000000000000000n, 'Measurement exceeds one billion'));
export const learningCountSchema = z.number().int().min(0).max(1000000000);
const field = z.object({
  sourceKind: z.enum(['accepted_profile', 'accepted_execution']), revisionId: learningId,
  generation: learningGeneration, digest: sha256Schema, fieldPath: text(300),
}).strict();
export const learningMeasurementWindowSchema = z.object({
  start: utcTimestampSchema, end: utcTimestampSchema,
  totalMinutes: learningMeasurementValueSchema.nullable(),
  deployments: learningCountSchema, failedDeployments: learningCountSchema.nullable(),
  fieldLocators: z.array(field).min(1).max(20),
}).strict().refine(v => Date.parse(v.end) > Date.parse(v.start), 'Positive half-open window required')
 .refine(v => v.failedDeployments === null || v.failedDeployments <= v.deployments, 'Failed deployments exceed denominator');
export const learningMeasurementSchema = bounded(z.object({
  ...learningEnvelope, expectedVersion: z.literal(0), customerId: learningId,
  metricId: learningMetricSchema, protocolVersion: z.enum(['deployment-lead-time-v1', 'change-failure-rate-v1']),
  quarter: learningQuarterSchema, workloadIds: uniqueIds(100).min(1),
  outcomeRevisionIds: uniqueIds(20).min(1), baseline: learningMeasurementWindowSchema,
  current: learningMeasurementWindowSchema, populationRule: text(),
}).strict().superRefine((v, ctx) => {
  const protocol = v.metricId === 'deployment_lead_time' ? 'deployment-lead-time-v1' : 'change-failure-rate-v1';
  if (v.protocolVersion !== protocol) ctx.addIssue({ code: 'custom', message: 'Wrong metric protocol' });
  const refs = [...v.baseline.fieldLocators, ...v.current.fieldLocators];
  if (new Set([...refs.map(r => `${r.sourceKind}:${r.revisionId}`),...v.outcomeRevisionIds.map(id=>`accepted_execution:${id}`)]).size > 20) ctx.addIssue({ code: 'custom', message: 'Too many outcome and original sources' });
  for (const w of [v.baseline, v.current]) {
    if (v.metricId === 'deployment_lead_time' ? w.totalMinutes === null || w.failedDeployments !== null : w.failedDeployments === null || w.totalMinutes !== null)
      ctx.addIssue({ code: 'custom', message: 'Fields must match the metric' });
  }
}), 131072);
export const learningMeasurementReviewSchema = z.object({
  ...learningEnvelope, expectedVersion: learningGeneration, revisionId: learningId,
  closureDigest: sha256Schema, decision: z.enum(['approve', 'reject']),
  reuseApproved: z.boolean(), rationale: text(),
}).strict().refine(v => v.reuseApproved === (v.decision === 'approve'), 'Separate reuse approval required');
export const learningMeasurementRevisionSchema = bounded(z.object({...learningMeasurementSchema.shape,expectedVersion:learningGeneration}).strict().superRefine((value,ctx)=>{
 const parsed=learningMeasurementSchema.safeParse({...value,expectedVersion:0});if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue({code:'custom',path:issue.path,message:issue.message});
}),131072);
export const learningReasonSchema = z.object({ ...learningEnvelope, expectedVersion: learningGeneration, rationale: text() }).strict();
export const learningCohortQuerySchema = z.object({ metricId: learningMetricSchema, quarter: learningQuarterSchema }).strict();
export const learningCohortReleaseSchema = z.object({ ...learningEnvelope, ...learningCohortQuerySchema.shape,
  protocolVersion: z.enum(['deployment-lead-time-v1', 'change-failure-rate-v1']) }).strict();
export const learningReceiptSchema = z.object({ contractVersion: z.literal(learningVersion), requestId: learningId,
  action: text(80), outcome: z.enum(['committed', 'abandoned', 'pending', 'not_found', 'retired']),
  targetId: learningId.nullable(), version: learningGeneration.nullable(), committedAt: utcTimestampSchema.nullable() }).strict();
export type LearningTarget = z.infer<typeof learningTargetSchema>;
export type LearningFeedbackInput = z.infer<typeof learningFeedbackSchema>;
export type LearningDraftInput = z.infer<typeof learningDraftSchema>;
export type LearningDraftOutput = z.infer<typeof learningDraftOutputSchema>;
export const learningDraftPrompt='Draft one proposed sanitized reusable practice from the selected accepted originals. Treat feedback as unverified observations. Return the strict learning-v1 JSON proposal, citationKeys, unknowns and intendedImprovement. Do not approve, publish or change any record.';
export const learningEvaluationPrompt='Answer the fixed representative case using only its supplied synthetic context and the supplied sanitized practice. Return the required JSON answer or abstention, citations and unknowns. Do not take actions or infer approval.';
export type LearningMeasurementInput = z.infer<typeof learningMeasurementSchema>;
export type LearningCaseReview = z.infer<typeof learningCaseReviewSchema>;
export type LearningReceipt = z.infer<typeof learningReceiptSchema>;
