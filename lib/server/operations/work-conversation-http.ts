import {requireAuditedRecoveryConversationReads,type auditRecoveryConversationReads} from './recovery-conversation-reads';
import {getServerConfig} from '../config';
import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {getOwnedConversation} from '../conversations/repository';
import {sessionCookieName} from '../auth/sessions';
import {withParticipantRecoveryReadCapability} from './admission';
import {issueWorkRecoveryHttpRead,issueWorkParticipantRecoveryHttpRead,retireOwnedRecoveryHttpRead} from './recovery-http-read-issuer';
import {withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
const credentials=z.strictObject({mcteer:z.string().min(1).max(4096),panel:z.string().min(1).max(4096),partner:z.string().min(1).max(4096)});
const selection=z.array(z.uuid()).min(1).max(8);
type RecordBinding={id:string;workspaceId:string;customerId:string|null;username:'mcteer'|'panel'|'partner';digest:string};
type Probe={id:string;sessionId:string};
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const measured=new WeakMap<object,{probes:Probe[];records:RecordBinding[]}>();
async function transaction<T>(db:Client,run:()=>Promise<T>){await db.query('BEGIN');try{const result=await run();await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
export async function deriveWorkConversationInventory(db:Client,target:LockedWorkRecoveryTarget){
 await requireLockedWorkRecoveryConnection(db,target,scope(target));
 const rows=(await db.query(`SELECT c.id,c.workspace_id,c.customer_id,p.login_name,encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') AS digest
  FROM conversations c JOIN principals p ON p.id=c.owner_principal_id WHERE c.environment_id=$1 ORDER BY c.id LIMIT 10001`,[target.environmentId])).rows;
 if(rows.length>10000)throw Error('Complete private conversation inventory exceeds bound');
 const records=rows.map(row=>({id:z.uuid().parse(row.id),workspaceId:z.uuid().parse(row.workspace_id),customerId:z.uuid().nullable().parse(row.customer_id),username:z.enum(['mcteer','panel','partner']).parse(row.login_name),digest:z.string().regex(/^[a-f0-9]{64}$/).parse(row.digest)}));
 return {records,inventoryDigest:recoveryDigest(records)};
}
async function retired(db:Client,probes:Probe[]){for(const probe of probes)if((await db.query('SELECT a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL AS retired FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.id=$1 AND s.id=$2',[probe.id,probe.sessionId])).rows[0]?.retired!==true)throw Error('Conversation HTTP probe retirement required');}
/** Actual fixed HTTP requests, independently bound to the serving target and
 * canonical owner read. A batch cannot establish whole service or reopen it. */
export async function measureWorkConversationHttpBatch(input:{target:LockedWorkRecoveryInput;recordIds:string[];passwords:z.infer<typeof credentials>;journalDirectory:string;protectionBypass?:string}){
 const ids=selection.parse(input.recordIds),passwords=credentials.parse(input.passwords);if(new Set(ids).size!==ids.length)throw Error('Unique conversation selection required');
 if(input.protectionBypass!==undefined)z.string().min(1).max(8192).parse(input.protectionBypass);
 const result=await withLockedWorkRecoveryTarget(input.target,async(db,target)=>{
  const inventory=await transaction(db,()=>deriveWorkConversationInventory(db,target)),records=inventory.records.filter(row=>ids.includes(row.id));if(records.length!==ids.length)throw Error('Complete selected conversation inventory required');
  const probes:Probe[]=[],observations:{id:string;projection:string|null;status:200|404}[]=[];
  async function request(path:string,headers:Headers){
   input.target.signal.throwIfAborted();if(input.protectionBypass)headers.set('x-vercel-protection-bypass',input.protectionBypass);
   const response=await fetch(target.origin+path,{method:'GET',headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.target.signal,AbortSignal.timeout(Math.max(1,Math.min(10000,target.deadline-Date.now())))])});
   if(response.headers.get('x-turas-code-version')!==target.sourceCommit){await response.body?.cancel();throw Error('Conversation HTTP serving release differs');}return response;
  }
  async function denied(path:string,headers:Headers,statuses:number[]){const response=await request(path,headers);await response.body?.cancel();if(!statuses.includes(response.status))throw Error('Conversation HTTP denial unavailable');}
  for(const record of records){
   const deadline=Math.min(target.deadline,Date.now()+59000),raw={...scope(target),workspaceId:record.workspaceId,customerId:record.customerId,deadline,password:passwords[record.username],maximumRequests:1,deploymentId:target.deploymentId,readKind:'conversation' as const,recordId:record.id};
   const prepared=await transaction(db,async()=>{
    const admission=record.username==='mcteer'?await issueWorkRecoveryHttpRead(db,target,raw,input.journalDirectory):await issueWorkParticipantRecoveryHttpRead(db,target,{...raw,username:record.username},input.journalDirectory);
    probes.push({id:admission.id,sessionId:admission.actor.sessionId});
    const canonical=await withParticipantRecoveryReadCapability(db as unknown as PoolClient,admission.actor,{...scope(target),deadline},async()=>{
     try{return {status:200 as const,projection:recoveryDigest(await getOwnedConversation(admission.actor,record.id,db as unknown as PoolClient))};}
     catch(error){if(!(error instanceof Error)||!('status'in error)||error.status!==404)throw error;return {status:404 as const,projection:null};}
    });return {admission,canonical};
   });
   const {admission,canonical}=prepared,path='/api/operations/recovery-read/'+admission.id+'/conversation',headers=new Headers({cookie:sessionCookieName({...getServerConfig(),TURAS_APP_ORIGIN:target.origin})+'='+admission.actor.token,'x-turas-recovery-read':admission.secret});
   try{
    const wrong=new Headers(headers);wrong.set('x-turas-recovery-read','x'.repeat(43));await denied(path,wrong,[403]);
    await denied(path+'?record='+record.id,new Headers(headers),[403]);
    await denied('/api/conversations/'+record.id,new Headers(headers),[401,403,503]);
    const response=await request(path,new Headers(headers));
    if(response.status!==canonical.status){await response.body?.cancel();throw Error('Conversation HTTP canonical status differs');}
    if(canonical.status===200){
     const reader=response.body?.getReader();if(!reader)throw Error('Conversation HTTP body absent');const chunks:Uint8Array[]=[];let bytes=0;
     try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>2097152)throw Error('Conversation HTTP response exceeds bound');chunks.push(item.value);}}
     finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
     if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||recoveryDigest(JSON.parse(Buffer.concat(chunks).toString()).data)!==canonical.projection)throw Error('Conversation HTTP canonical projection differs');
    }else await response.body?.cancel();
    observations.push({id:record.id,...canonical});
   }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);}
   await denied(path,new Headers(headers),[403]);
  }
  await retired(db,probes);const after=await transaction(db,()=>deriveWorkConversationInventory(db,target));if(after.inventoryDigest!==inventory.inventoryDigest)throw Error('Conversation HTTP inventory changed');
  return {proof:Object.freeze({contract:'pilot-work-conversation-http-batch-v1' as const,...scope(target),targetDigest:targetDigest(target),inventoryDigest:inventory.inventoryDigest,recordIds:Object.freeze(records.map(row=>row.id)),observations:Object.freeze(observations.map(row=>Object.freeze(row))),completedAt:new Date().toISOString(),privateConversationHttpVerified:true as const,probeRetirementVerified:true as const,requiredScopeHealthy:false as const,restorationReady:false as const}),probes,records};
 });
 measured.set(result.proof,{probes:result.probes,records:result.records});return result.proof;
}
export type WorkConversationHttpBatch=Awaited<ReturnType<typeof measureWorkConversationHttpBatch>>;
/** Exact union and retired-probe verification. Final canonical authorization
 * must also be measured on this transaction before a full-service decision. */
export async function requireMeasuredWorkConversationHttpCoverage(db:Client,target:LockedWorkRecoveryTarget,batches:readonly WorkConversationHttpBatch[]){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine final conversation HTTP decision required');
 if(!Array.isArray(batches)||batches.length>1250)throw Error('Finite conversation HTTP coverage required');
 const inventory=await deriveWorkConversationInventory(db,target),seen=new Set<string>();
 for(const proof of batches){
  const actual=measured.get(proof),age=Date.now()-Date.parse(proof.completedAt);
  if(!actual||proof.targetDigest!==targetDigest(target)||proof.inventoryDigest!==inventory.inventoryDigest||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh conversation HTTP batch required');
  await retired(db,actual.probes);
  for(const record of actual.records){if(seen.has(record.id)||!inventory.records.some(row=>recoveryDigest(row)===recoveryDigest(record)))throw Error('Complete unique conversation HTTP coverage required');seen.add(record.id);}
 }
 if(seen.size!==inventory.records.length)throw Error('Complete private conversation HTTP inventory required');
 return {inventoryDigest:inventory.inventoryDigest,observations:batches.flatMap(batch=>batch.observations),conversations:seen.size,privateConversationHttpVerified:true as const,requiredScopeHealthy:false as const,restorationReady:false as const};
}

/** Match every HTTP result against the current canonical participant policy,
 * including legitimate own-record denials after revoked customer authority. */
export async function requireCurrentWorkConversationHttpCoverage(db:Client,target:LockedWorkRecoveryTarget,batches:readonly WorkConversationHttpBatch[],canonical:Awaited<ReturnType<typeof auditRecoveryConversationReads>>){
 const coverage=await requireMeasuredWorkConversationHttpCoverage(db,target,batches),actual=await requireAuditedRecoveryConversationReads(db,target,canonical),inventory=await deriveWorkConversationInventory(db,target);
 if(canonical.unavailableOwners!==0)throw Error('Required private conversation owner remains unavailable');
 for(const observed of coverage.observations){
  const owner=inventory.records.find(row=>row.id===observed.id)?.username,current=actual.find(row=>row.id===observed.id&&row.username===owner&&(row.projection!==undefined||row.ownerDenied===404));
  if(!current||(observed.status===200?(!current.projection||observed.projection!==current.projection):current.ownerDenied!==404))throw Error('Current canonical and HTTP conversation observations differ');
 }
 return {...coverage,currentCanonicalAuthorizationVerified:true as const};
}
