import {z} from 'zod';
import {pilotCommit,pilotDigest,pilotGateIds} from './pilot-readiness';
import {pilotHostedScopeSchema} from './pilot-hosted';
export const pilotReleaseEvidenceKinds=['owned-local','ci','quality','preview','production','operator'] as const;
export const pilotReleaseBundleSchema=z.strictObject({
 contract:z.literal('pilot-release-bundle-v1'),id:z.uuid(),createdAt:z.iso.datetime({offset:true}),
 sourceCommit:pilotCommit,sourceDigest:pilotDigest,catalogDigest:pilotDigest,
 preview:pilotHostedScopeSchema,production:pilotHostedScopeSchema,
 runs:z.array(z.strictObject({kind:z.enum(pilotReleaseEvidenceKinds),directory:z.string().min(1).max(4096),manifest:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,122}\.json$/),digest:pilotDigest,scope:pilotHostedScopeSchema.optional()})).min(1).max(32),
}).superRefine((value,ctx)=>{
 if(value.preview.target!=='preview'||value.production.target!=='production'||value.preview.environmentMarker===value.production.environmentMarker)ctx.addIssue({code:'custom',message:'Distinct exact Preview and Production scopes required'});
 for(const scope of [value.preview,value.production])for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(scope[key]!==value[key])ctx.addIssue({code:'custom',message:'Release target source differs'});
 for(const reference of value.runs){const hosted=['preview','production','operator'].includes(reference.kind);if(hosted!==Boolean(reference.scope))ctx.addIssue({code:'custom',message:'Exact original hosted execution scope required'});if(reference.scope){const target=reference.kind==='preview'?value.preview:value.production;for(const key of ['projectId','teamId','deploymentId','origin','environmentMarker','workspaceId','target','sourceCommit','sourceDigest','catalogDigest'] as const)if(reference.scope[key]!==target[key])ctx.addIssue({code:'custom',message:'Original hosted scope targets another release'});}}
 if(new Set(value.runs.map(row=>row.kind+':'+row.digest)).size!==value.runs.length)ctx.addIssue({code:'custom',message:'Duplicate scoped reference identity'});
 if(new Set(value.runs.map(row=>row.directory+'/'+row.manifest)).size!==value.runs.length)ctx.addIssue({code:'custom',message:'Duplicate scoped evidence run'});
});
export type PilotReleaseBundle=z.infer<typeof pilotReleaseBundleSchema>;
export const pilotReleaseObservationSchema=z.strictObject({
 contract:z.literal('pilot-release-gate-observation-v1'),id:z.uuid(),bundleId:z.uuid(),bundleDigest:pilotDigest,gateId:z.enum(pilotGateIds),
 sourceCommit:pilotCommit,sourceDigest:pilotDigest,catalogDigest:pilotDigest,
 startedAt:z.iso.datetime({offset:true}),completedAt:z.iso.datetime({offset:true}),state:z.enum(['pass','fail','blocked','unverified']),
 executions:z.array(z.strictObject({runId:z.uuid(),runDigest:pilotDigest,attemptId:z.uuid(),receiptId:z.uuid(),proofDigest:pilotDigest,environmentMarker:z.string().min(1).max(256),workspaceId:z.uuid(),scopeDigest:pilotDigest,method:z.string(),role:z.string(),startedAt:z.iso.datetime({offset:true}),completedAt:z.iso.datetime({offset:true})})).max(512),
 dependencies:z.array(z.strictObject({gateId:z.enum(pilotGateIds),observationId:z.uuid(),digest:pilotDigest})).max(22),
}).refine(value=>Date.parse(value.completedAt)>=Date.parse(value.startedAt),'Invalid release observation interval');
