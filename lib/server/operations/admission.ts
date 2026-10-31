import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {authenticateMcpCredential} from '../mcp/credentials';
import {lockWorkspaceActor} from '../profiles/policy';
import {authenticateRecoveryHttpRead,type RecoveryHttpRead} from './recovery-http-read';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {getServerConfig} from '../config';
import {query} from '../db/client';
import {HttpFailure} from '../../contracts/http';
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import type {McpReadActor} from '../auth/read-actor';
import {operationalControlUnderFence,hasProtectedCancellation,operationalAdmissionOpen} from './session-admission';
export {operationalAdmissionOpen,protectedCancellationRequest,registerProtectedCancellation} from './session-admission';
const recoveryReadActors=new WeakMap<object,{client:PoolClient;environmentId:string;recoveryId:string;revision:number;deadline:number}>();
const readProbeScope=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),deadline:z.number().int().positive()});
/** Owner-only in-process capability. A serialized actor, header or healthy flag
 * cannot recreate it. Requires a caller-owned transaction; its locks remain
 * held until that transaction ends. Normal writes and public login remain closed. */
export async function withOwnerRecoveryReadCapability<T>(client:PoolClient,actor:CurrentSession,raw:z.infer<typeof readProbeScope>,read:()=>Promise<T>){
 return withRecoveryParticipantCapability(client,actor,raw,read,true);
}
/** Canonical session and live role checks for a bounded owner-run participant read.
 * This does not grant any customer entitlement; each domain read rechecks it. */
export async function withParticipantRecoveryReadCapability<T>(client:PoolClient,actor:CurrentSession,raw:z.infer<typeof readProbeScope>,read:()=>Promise<T>){
 return withRecoveryParticipantCapability(client,actor,raw,read,false);
}
async function withRecoveryParticipantCapability<T>(client:PoolClient,actor:CurrentSession,raw:z.infer<typeof readProbeScope>,read:()=>Promise<T>,ownerOnly:boolean){
 const scope=readProbeScope.parse(raw),now=Date.now();
 if(scope.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID||scope.deadline<=now||scope.deadline>now+300000||(ownerOnly&&(actor.kind!=='internal'||actor.role!=='admin'||actor.loginName!=='mcteer'))||!['mcteer','panel','partner'].includes(actor.loginName)||!/^[A-Za-z0-9_-]{43}$/.test(actor.token)||recoveryReadActors.has(actor))throw new HttpFailure(403,'forbidden','Recovery read probe unavailable');
 if((await client.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw new HttpFailure(403,'forbidden','Exact owner recovery read probe required');
 try{await client.query('SAVEPOINT turas_recovery_read_probe');await client.query('RELEASE SAVEPOINT turas_recovery_read_probe');}
 catch{throw new HttpFailure(403,'forbidden','Recovery read probe requires an active transaction');}
 await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[scope.environmentId]);
 const rows=(await client.query(`SELECT c.environment_id FROM operations_control c JOIN turas_environment e ON e.environment_id=c.environment_id
  JOIN login_sessions s ON s.id=$4 AND s.principal_id=$5 AND s.membership_id=$6 AND s.workspace_id=$7
  JOIN memberships m ON m.id=s.membership_id AND m.principal_id=s.principal_id AND m.workspace_id=s.workspace_id
  JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
  WHERE c.environment_id=$1 AND c.mode='locked' AND c.recovery_id=$2 AND c.revision=$3 AND e.schema_version=${CURRENT_SCHEMA_VERSION}
   AND s.token_hash=$8 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND m.active AND p.active AND w.active
   AND m.kind=$9 AND m.role=$10 AND p.login_name=$11
   AND (m.kind='internal' OR (m.kind='partner' AND EXISTS(SELECT 1 FROM partner_organizations o WHERE o.id=m.partner_org_id AND o.workspace_id=m.workspace_id AND o.active)))
   AND (w.classification='primary' OR w.pilot_environment_id=$1)
   AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) FOR SHARE OF c,s,m,p,w`,[scope.environmentId,scope.recoveryId,scope.controlRevision,actor.sessionId,actor.principalId,actor.membershipId,actor.workspaceId,createHash('sha256').update(actor.token).digest('hex'),actor.kind,actor.role,actor.loginName])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'forbidden','Exact owner recovery read probe required');
 recoveryReadActors.set(actor,{client,environmentId:scope.environmentId,recoveryId:scope.recoveryId,revision:scope.controlRevision,deadline:scope.deadline});
 try{return await read();}finally{recoveryReadActors.delete(actor);}
}
/** Real bearer authentication on the owner-run recovery transaction. The normal
 * MCP endpoint retains its ordinary operational gate. No supplied actor is accepted. */
export async function withAuthenticatedMcpRecoveryReadCapability<T>(client:PoolClient,authorization:string|null,raw:z.infer<typeof readProbeScope>,read:(actor:McpReadActor)=>Promise<T>){
 const scope=readProbeScope.parse(raw),now=Date.now();
 if(scope.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID||scope.deadline<=now||scope.deadline>now+60000)throw new HttpFailure(403,'forbidden','Short-lived MCP recovery read required');
 await client.query('SAVEPOINT authenticated_mcp_recovery_probe; RELEASE SAVEPOINT authenticated_mcp_recovery_probe');
 await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[scope.environmentId]);
 const control=(await client.query(`SELECT c.environment_id FROM operations_control c JOIN turas_environment e ON e.environment_id=c.environment_id
 WHERE c.environment_id=$1 AND c.mode='locked' AND c.recovery_id=$2 AND c.revision=$3 AND e.schema_version=${CURRENT_SCHEMA_VERSION}
 AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) FOR SHARE OF c`,[scope.environmentId,scope.recoveryId,scope.controlRevision])).rows;
 if(control.length!==1)throw new HttpFailure(403,'forbidden','Exact locked MCP recovery owner required');
 const actor=await authenticateMcpCredential(client,authorization);
 recoveryReadActors.set(actor,{client,environmentId:scope.environmentId,recoveryId:scope.recoveryId,revision:scope.controlRevision,deadline:scope.deadline});
 try{
  await lockWorkspaceActor(client,actor,undefined,true,2000);
  const result=await read(actor);
  const current=await authenticateMcpCredential(client,authorization);
  if(scope.deadline<=Date.now()||JSON.stringify(current)!==JSON.stringify(actor))throw new HttpFailure(403,'forbidden','MCP recovery authentication changed');
  await lockWorkspaceActor(client,actor,undefined,true,2000);return result;
 }finally{recoveryReadActors.delete(actor);}
}
/** The fixed maintenance handler authenticates an actual owner-issued database
 * admission on this direct runtime transaction, never a caller-supplied actor. */
export async function withRecoveryHttpReadCapability<T>(db:PoolClient,request:Request,id:string,read:(actor:CurrentSession,customerId:string|null,proof:RecoveryHttpRead)=>Promise<T>){
 const proof=await authenticateRecoveryHttpRead(db,request,id,false);
 if(proof.readKind==='mcp')throw new HttpFailure(403,'forbidden','Dedicated MCP recovery capability required');
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[proof.environmentId]);
 recoveryReadActors.set(proof.actor,{client:db,environmentId:proof.environmentId,recoveryId:proof.recoveryId,revision:proof.controlRevision,deadline:proof.deadline});
 try{const result=await read(proof.actor,proof.customerId,proof);await authenticateRecoveryHttpRead(db,request,id,false);return result;}
 finally{recoveryReadActors.delete(proof.actor);}
}
/** Runtime MCP exception requires both the owner-issued finite HTTP admission
 * and the independent actual bearer for that same principal/membership/connection. */
export async function withRecoveryMcpHttpReadCapability<T>(db:PoolClient,request:Request,id:string,read:(actor:McpReadActor)=>Promise<T>){
 const proof=await authenticateRecoveryHttpRead(db,request,id,false);
 if(proof.readKind!=='mcp'||!proof.recordId)throw new HttpFailure(403,'forbidden','Recovery MCP admission required');
 const actor=await authenticateMcpCredential(db,request.headers.get('authorization'));
 if(actor.connectionId!==proof.recordId||actor.scopeDigest!==proof.recordDigest||actor.principalId!==proof.actor.principalId||actor.membershipId!==proof.actor.membershipId||actor.workspaceId!==proof.actor.workspaceId||actor.environmentId!==proof.environmentId)throw new HttpFailure(403,'forbidden','Recovery MCP credential differs');
 const deadline=Math.min(proof.deadline,Date.now()+10000);
 recoveryReadActors.set(actor,{client:db,environmentId:proof.environmentId,recoveryId:proof.recoveryId,revision:proof.controlRevision,deadline});
 try{
  await db.query("SELECT set_config('transaction_timeout',$1,true)",[Math.max(1,deadline-Date.now())+'ms']);
  await lockWorkspaceActor(db,actor,undefined,true,2000);const result=await read(actor);
  const current=await authenticateMcpCredential(db,request.headers.get('authorization'));
  if(JSON.stringify(current)!==JSON.stringify(actor))throw new HttpFailure(403,'forbidden','Recovery MCP credential changed');
  await lockWorkspaceActor(db,actor,undefined,true,2000);await authenticateRecoveryHttpRead(db,request,id,false);request.signal.throwIfAborted();if(Date.now()>=deadline)throw new HttpFailure(503,'unavailable','Recovery MCP deadline ended');return result;
 }finally{recoveryReadActors.delete(actor);}
}
export async function requireOperationalOpen(db:PoolClient,actor?:object,readOnly=false){
 const {environmentId,row}=await operationalControlUnderFence(db);
 const probe=actor?recoveryReadActors.get(actor):undefined;
 if(readOnly&&probe&&probe.client===db&&probe.environmentId===environmentId&&probe.deadline>Date.now()&&row?.mode==='locked'&&row.recovery_id===probe.recoveryId&&Number(row.revision)===probe.revision)return;
 if(!row||row.mode!=='open'&&(!actor||!hasProtectedCancellation(actor)))throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
}
/** Capture's exclusive fence waits for bounded private writes and cleanup IO.
 * Quiescing closes new writes without preventing already admitted IO from draining. */
let ioClient:PoolClient|undefined,ioUsers=0,ioAcquireUnavailableUntil=0;
let ioQueue:Promise<void>=Promise.resolve();
async function serializeIo<T>(run:()=>Promise<T>):Promise<T>{
 const preceding=ioQueue;let release!:()=>void;ioQueue=new Promise<void>(resolve=>{release=resolve;});
 await preceding;try{return await run();}finally{release();}
}
export async function withOperationalIo<T>(run:()=>Promise<T>,cleanup=false):Promise<T>{
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 await serializeIo(async()=>{
  if(!ioClient){
   if(Date.now()<ioAcquireUnavailableUntil)throw new HttpFailure(503,'recovery_io_unavailable','Service temporarily unavailable');
   const {getOperationalFencePool}=await import('../db/client'),client=await getOperationalFencePool().connect();
   try{await client.query('SELECT pg_advisory_lock_shared(hashtextextended($1,16017))',[environmentId]);ioClient=client;}
   catch(error){ioAcquireUnavailableUntil=Date.now()+1000;client.release(true);throw error;}
  }
  try{
   if(!cleanup&&(await ioClient.query("SELECT 1 FROM operations_control WHERE environment_id=$1 AND mode='open'",[environmentId])).rowCount!==1)throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
   ioUsers++;
  }catch(error){if(ioUsers===0)await releaseIo(environmentId);throw error;}
 });
 try{return await run();}
 finally{await serializeIo(async()=>{ioUsers--;if(ioUsers===0)await releaseIo(environmentId);});}
}
async function releaseIo(environmentId:string){
 const client=ioClient;ioClient=undefined;if(!client)return;let destroy=false;
 try{destroy=(await client.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,16017)) AS released',[environmentId])).rows[0]?.released!==true;}
 catch{destroy=true;}finally{client.release(destroy);}
 if(destroy)throw Error('Private IO capture fence could not be verified');
}

/** Positive provider/cache work shares the capture fence for its entire lifetime.
 * Released schemas retain their original behavior; transitional/unknown schemas
 * cannot accidentally opt out of the current operational contract. */
export async function withOperationalProviderIo<T>(run:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 signal?.throwIfAborted();
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 const rows=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(rows.length!==1||rows[0].environment_id!==environmentId||!Number.isSafeInteger(Number(rows[0].schema_version))||Number(rows[0].schema_version)<1)throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
 const version=Number(rows[0].schema_version);
 if(version<=77){signal?.throwIfAborted();return run();}
 if(version!==CURRENT_SCHEMA_VERSION||!await operationalAdmissionOpen())throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
 // Refuse closed service before waiting on an owner's exclusive decision lock.
 // The canonical IO fence still rechecks admission after acquiring its lock.
 return withOperationalIo(()=>{signal?.throwIfAborted();return run();});
}
