import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {hostedConfigurationSchema,verifyHostedConfiguration} from './hosted-configuration';
import {withLockedWorkRecoveryTarget,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {createAuthenticatedWorkRecoverySession} from './authenticated-recovery-read';
import {sessionCookie} from '../auth/sessions';
import {getServerConfig} from '../config';

export const restoredWorkStoreSchema=z.strictObject({
 originalStoreId:z.string().regex(/^[A-Za-z0-9-]{1,128}$/),
 expectedConfiguration:hostedConfigurationSchema,
}).refine(value=>value.originalStoreId!==value.expectedConfiguration.storeId,'Separate original and restored stores required');
export type RestoredWorkStore=z.infer<typeof restoredWorkStoreSchema>;
export type WorkRecoveryStoreObservation=Readonly<{contract:'pilot-work-restored-store-observation-v1';targetDigest:string;mappingDigest:string;observedAt:string}>;
const observed=new WeakSet<object>();
const identity=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...value}=target;return recoveryDigest(value);};
export function restoredWorkStoreDigest(raw:RestoredWorkStore){return recoveryDigest(restoredWorkStoreSchema.parse(raw));}
function binding(raw:RestoredWorkStore,target:LockedWorkRecoveryTarget,storeId:string){
 const value=restoredWorkStoreSchema.parse(raw),config=value.expectedConfiguration;
 if(config.environmentMarker!==target.environmentId||config.projectId!==target.projectId||config.teamId!==target.teamId||config.storeId!==storeId)throw Error('Exact restored store deployment binding required');
 return value;
}
export function requireObservedWorkRecoveryStore(raw:RestoredWorkStore,storeId:string,target:LockedWorkRecoveryTarget,proof:WorkRecoveryStoreObservation|undefined){
 const value=binding(raw,target,storeId),age=proof?Date.now()-Date.parse(proof.observedAt):NaN;
 if(!proof||!observed.has(proof)||proof.targetDigest!==identity(target)||proof.mappingDigest!==restoredWorkStoreDigest(value)||!Number.isFinite(age)||age<0||age>14400000)throw Error('Genuine current restored store configuration observation required');
 return value;
}
/** A configured source ID selects the authenticated capture's digest preimage;
 * it grants no authority. Only actual platform-bound HTTP can brand an observed
 * destination. The caller separately restores archive bytes with the governed
 * storage copier; this read never copies, unlocks, or certifies full service. */
export async function observeWorkRecoveryStore(input:{target:LockedWorkRecoveryInput;store:RestoredWorkStore;storeId:string;password:string;protectionBypass:string;journalDirectory:string}){
 const value=restoredWorkStoreSchema.parse(input.store);
 z.string().min(1).max(4096).parse(input.password);z.string().min(1).max(8192).parse(input.protectionBypass);
 const proof=await withLockedWorkRecoveryTarget(input.target,async(db,target)=>{
  binding(value,target,input.storeId);
  let actor:Awaited<ReturnType<typeof createAuthenticatedWorkRecoverySession>>['actor']|undefined;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   try{
    ({actor}=await createAuthenticatedWorkRecoverySession(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,workspaceId:input.target.hostedScope.workspaceId,deadline:Math.min(target.deadline,Date.now()+59000),password:input.password},input.journalDirectory));
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
   const signal=AbortSignal.any([input.target.signal,AbortSignal.timeout(Math.max(1,Math.min(15000,target.deadline-Date.now())))]);
   const cookie=sessionCookie(actor.token,actor.expiresAt,{...getServerConfig(),TURAS_APP_ORIGIN:target.origin}).split(';')[0];
   const response=await fetch(new URL('/api/operations/status',target.origin),{headers:{cookie,'x-vercel-protection-bypass':input.protectionBypass},redirect:'manual',cache:'no-store',signal});
   if(response.status!==200||response.headers.get('x-turas-code-version')!==target.sourceCommit){await response.body?.cancel();throw Error('Exact restored store serving deployment required');}
   const reader=response.body?.getReader();if(!reader)throw Error('Restored store configuration body required');
   const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536)throw Error('Restored store configuration exceeds bound');chunks.push(next.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const body=JSON.parse(Buffer.concat(chunks,size).toString()).data;
   if(body?.admission!=='closed'||body?.deployment?.codeVersion!==target.sourceCommit)throw Error('Locked restored store configuration required');
   verifyHostedConfiguration(body.configuration,value.expectedConfiguration);
   return Object.freeze({contract:'pilot-work-restored-store-observation-v1' as const,targetDigest:identity(target),mappingDigest:restoredWorkStoreDigest(value),observedAt:new Date().toISOString()});
  }finally{
   if(actor){await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[actor.sessionId]);const rows=(await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[actor.sessionId])).rows;if(rows.length!==1||rows[0].retired!==true)throw Error('Restored store observation session retirement unverified');}
  }
 });
 // The transport must also finish its independent source/platform/retirement
 // checks before a callback result becomes an in-process observation.
 observed.add(proof);return proof;
}
