import {z} from 'zod';
import {evidenceDigest} from './pilot-evidence';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';

// Preserve the originally approved Preview envelope and its exact digest bytes.
export const previewInfrastructureAuthorizationSchema=z.object({
 contract:z.literal('pilot-preview-infrastructure-user-authorization-v1'),id:z.uuid(),
 approvedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
 planDigest:z.string().regex(/^[a-f0-9]{64}$/),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),environmentMarker:z.string().min(1).max(128),target:z.literal('preview'),capMicroUsd:z.literal(10000000),
 partitionsMicroUsd:z.strictObject({sandbox:z.literal(3000000),blobAndTransfer:z.literal(2000000),functionsAndWorkflow:z.literal(3000000),builds:z.literal(2000000)}),
 maximumSandboxJobs:z.literal(32),maximumConcurrentJobs:z.literal(2),maximumJobDeadlineMs:z.literal(300000),maximumPreviewDeployments:z.literal(2),maximumPrivateStores:z.literal(1),automaticTopUp:z.literal(false),automaticBillingChanges:z.literal(false),productionChangesAuthorized:z.literal(false),additionalModelAllowanceAuthorized:z.literal(false),
}).superRefine((value,ctx)=>{if(Date.parse(value.expiresAt)-Date.parse(value.approvedAt)!==172800000)ctx.addIssue({code:'custom',message:'Exact 48-hour infrastructure authorization required'});});

const digest=z.string().regex(/^[a-f0-9]{64}$/),money=z.number().int().min(0).max(100000000);
/** Proposed JSON is never approval. The operator must bind an actual attributable
 * user instruction, then provision its digest into an independently admitted
 * target budget. This schema neither creates authority nor renews old budgets. */
export const infrastructureAuthorizationSchema=z.strictObject({
 contract:z.literal('pilot-infrastructure-user-authorization-v2'),id:z.uuid(),
 userInstructionReference:z.string().trim().min(1).max(512),
 approvedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
 planDigest:digest,projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),
 environmentMarker:z.string().min(1).max(128),target:z.enum(['preview','production']),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
 capMicroUsd:money.refine(value=>value>0),
 partitionsMicroUsd:z.strictObject({sandbox:money,blobAndTransfer:money,functionsAndWorkflow:money,builds:money}),
 maximumSandboxJobs:z.literal(32),maximumConcurrentJobs:z.literal(2),maximumJobDeadlineMs:z.literal(300000),
 maximumDeployments:z.literal(2),maximumPrivateStores:z.literal(1),
 automaticTopUp:z.literal(false),automaticBillingChanges:z.literal(false),
 productionChangesAuthorized:z.boolean(),additionalModelAllowanceAuthorized:z.literal(false),
}).superRefine((value,ctx)=>{
 if(Date.parse(value.expiresAt)-Date.parse(value.approvedAt)!==172800000||
  Object.values(value.partitionsMicroUsd).reduce((sum,n)=>sum+n,0)!==value.capMicroUsd||
  value.productionChangesAuthorized!==(value.target==='production'))ctx.addIssue({code:'custom',message:'Exact target, 48-hour window and partitioned cap required'});
});

export function verifyHostedInfrastructureAuthorization(raw:unknown,scope:PilotHostedScope,now=Date.now()){
 const legacy=typeof raw==='object'&&raw!==null&&'contract' in raw&&raw.contract==='pilot-preview-infrastructure-user-authorization-v1';
 const value=legacy?previewInfrastructureAuthorizationSchema.parse(raw):infrastructureAuthorizationSchema.parse(raw);
 if(!Number.isFinite(now)||Date.parse(value.approvedAt)>now||Date.parse(value.expiresAt)<=now||
  value.target!==scope.target||value.projectId!==scope.projectId||value.teamId!==scope.teamId||value.environmentMarker!==scope.environmentMarker)
  throw Error('Fresh exact-target infrastructure authorization required');
 if(value.contract==='pilot-infrastructure-user-authorization-v2'&&
  (value.sourceCommit!==scope.sourceCommit||value.sourceDigest!==scope.sourceDigest||value.catalogDigest!==scope.catalogDigest))throw Error('Infrastructure authorization source differs');
 return {...value,authorizationDigest:evidenceDigest(JSON.stringify(raw)),maximumDeployments:value.contract==='pilot-infrastructure-user-authorization-v2'?value.maximumDeployments:value.maximumPreviewDeployments};
}
