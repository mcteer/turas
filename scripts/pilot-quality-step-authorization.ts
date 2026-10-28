import {z} from 'zod';
/** Full original research: recon four, practices two, cancelled-run one. */
export const qualityContextCreditCap=z.number().int().min(0).max(7);
export const qualityOperatorAuthorization=z.strictObject({contract:z.literal('pilot-quality-operator-v1'),id:z.uuid(),feature:z.literal('016'),category:z.literal('model-evaluation'),modelId:z.literal('spacexai/grok-4.7'),capMicroUsd:z.number().int().positive().max(100000000),contextCreditCap:qualityContextCreditCap,automaticBillingAllowed:z.literal(false),independentReviewAuthorized:z.literal(true),userInstructionReference:z.string().trim().min(1).max(512),recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true})});
export const qualityStepAuthorization=z.strictObject({
 contract:z.literal('pilot-quality-step-authorization-v1'),feature:z.literal('016'),catalog:z.literal('003'),
 budgetId:z.uuid(),authorizationDigest:z.string().regex(/^[a-f0-9]{64}$/),modelStepCap:z.literal(32),
 userInstructionReference:z.string().trim().min(1).max(512),recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true})
});
export function verifyQualityStepAuthorization(input:unknown,authority:{id:string;authorizationDigest:string;expiresAt:string},now=Date.now()){
 const approval=qualityStepAuthorization.parse(input);
 if(approval.budgetId!==authority.id||approval.authorizationDigest!==authority.authorizationDigest||approval.expiresAt!==authority.expiresAt||Date.parse(approval.recordedAt)>now||Date.parse(approval.recordedAt)>=Date.parse(approval.expiresAt)||Date.parse(approval.expiresAt)<=now)throw Error('Applicable original-budget step authorization required');
 return approval;
}
