import {z} from 'zod';
import {pilotHostedScopeSchema} from './pilot-hosted';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const hostedLearningBindingSchema=z.strictObject({
 contract:z.literal('pilot-hosted-learning-ledger-v1'),budgetId:z.uuid(),originalAuthorizationDigest:digest,
 capMicroUsd:z.number().int().positive().max(25000000),environmentMarker:z.string().min(1).max(128),
 workspaceId:z.uuid(),ownerPrincipalId:z.uuid(),target:z.enum(['preview','production']),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
 recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
}).refine(value=>Date.parse(value.expiresAt)>Date.parse(value.recordedAt)&&Date.parse(value.expiresAt)-Date.parse(value.recordedAt)<=86400000);
export const hostedLearningDispatchSchema=z.strictObject({
 contract:z.literal('pilot-hosted-learning-dispatch-v1'),scope:pilotHostedScopeSchema,
 evaluationId:z.uuid(),learningAttemptId:z.uuid(),actorMembershipId:z.uuid(),
 caseId:z.string().regex(/^E0[1-8]$/),purpose:z.enum(['evaluation_baseline','evaluation_candidate']),
 nativeSessionId:z.string().min(1).max(256),nativeRequestId:z.uuid(),priceDigest:digest,
});
export type HostedLearningBinding=z.infer<typeof hostedLearningBindingSchema>;
