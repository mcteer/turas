import {z} from 'zod';
import {createHash} from 'node:crypto';
const digest=z.string().regex(/^[a-f0-9]{64}$/),identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),timestamp=z.iso.datetime({offset:true});
export const recoveryStoreKinds=['artifact','workforce','report','gap-report'] as const;
const checkpoint=z.strictObject({id:z.uuid(),capturedAt:timestamp,digest});
export const recoveryManifestSchema=z.strictObject({
 contract:z.literal('pilot-recovery-v1'),id:z.uuid(),environmentId:identity,recoveryId:z.uuid(),controlRevision:z.number().int().positive(),
 capturedAt:timestamp,expiresAt:timestamp,sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,
 schemaVersion:z.literal(57),ledgerDigest:digest,runtimeGrantsDigest:digest,configurationDigest:digest,acceptedContentDigest:digest,
 encryptedBundle:z.strictObject({headerDigest:digest,digest,sizeBytes:z.number().int().positive().max(1024**4)}),
 database:z.strictObject({checkpoint,dumpDigest:digest,dumpBytes:z.number().int().positive().max(1024**4),serverMajor:z.union([z.literal(17),z.literal(18)]),clientMajor:z.union([z.literal(17),z.literal(18)])}),
 stores:z.array(z.strictObject({kind:z.enum(recoveryStoreKinds),checkpoint,inventoryDigest:digest,objectCount:z.number().int().nonnegative().max(100000),complete:z.literal(true)})).length(4),
 workflow:z.strictObject({backend:z.enum(['owned-local','managed-workflow']),capability:z.enum(['matched-checkpoint','interrupted-reconciliation']),checkpoint,acceptedApplicationStateInDatabase:z.literal(true),unrecoverableAcceptedRecords:z.literal(0),verified:z.literal(true)}),
 key:z.strictObject({reference:identity,version:identity,algorithm:z.literal('aes-256-gcm'),available:z.literal(true),probeDigest:digest}),
 authority:z.strictObject({environmentId:identity,capturedAt:timestamp,watermark:identity,digest,independent:z.literal(true),source:z.literal('current-denials-and-replay')}),
 outsideCopy:z.strictObject({failureDomain:identity,sourceFailureDomain:identity,encryptedDigest:digest,verified:z.literal(true)}),
}).superRefine((value,ctx)=>{
 if(value.database.serverMajor!==value.database.clientMajor)ctx.addIssue({code:'custom',message:'Matched database and client major required'});
 const checkpoints=[value.database.checkpoint,...value.stores.map(s=>s.checkpoint),value.workflow.checkpoint];
 if(checkpoints.some(c=>c.id!==value.id||c.capturedAt!==value.capturedAt))ctx.addIssue({code:'custom',message:'Unmatched capture boundary'});
 if(new Set(value.stores.map(s=>s.kind)).size!==4)ctx.addIssue({code:'custom',message:'Incomplete private-store inventory'});
 if(Date.parse(value.expiresAt)-Date.parse(value.capturedAt)!==7*86400000)ctx.addIssue({code:'custom',message:'Managed backup expiry differs'});
 if(value.authority.environmentId!==value.environmentId||Date.parse(value.authority.capturedAt)<Date.parse(value.capturedAt))ctx.addIssue({code:'custom',message:'Independent current authority unavailable'});
 if(value.outsideCopy.failureDomain===value.outsideCopy.sourceFailureDomain||value.outsideCopy.encryptedDigest!==value.encryptedBundle.digest)ctx.addIssue({code:'custom',message:'Outside-domain copy unverified'});
 if(value.workflow.backend==='managed-workflow'&&value.workflow.capability!=='interrupted-reconciliation')ctx.addIssue({code:'custom',message:'Managed workflow checkpoint is not established'});
});
export type RecoveryManifest=z.infer<typeof recoveryManifestSchema>;
export function verifyRecoveryManifest(input:unknown,expected:{environmentId:string;ledgerDigest:string;now?:number}){
 const value=recoveryManifestSchema.parse(input),now=expected.now??Date.now();
 if(value.environmentId!==expected.environmentId||value.ledgerDigest!==expected.ledgerDigest)throw Error('Recovery identity or ledger differs');
 if(Date.parse(value.capturedAt)>now||Date.parse(value.expiresAt)<=now)throw Error('Recovery capture unavailable or expired');
 return value;
}
export function recoveryDigest(value:unknown){
 const serialized=JSON.stringify(value);if(serialized===undefined)throw Error('JSON recovery identity required');
 const canonical=(item:any):any=>Array.isArray(item)?item.map(canonical):item!==null&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,canonical(item[key])])):item;
 return createHash('sha256').update(JSON.stringify(canonical(JSON.parse(serialized)))).digest('hex');
}
