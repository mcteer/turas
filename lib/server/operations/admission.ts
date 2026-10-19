import {authenticateRecoveryHttpRead} from './recovery-http-read';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {getServerConfig} from '../config';
import {query} from '../db/client';
import {HttpFailure} from '../../contracts/http';
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
const cancellationActors=new WeakSet<object>();
const recoveryReadActors=new WeakMap<object,{client:PoolClient;environmentId:string;recoveryId:string;revision:number;deadline:number}>();
const readProbeScope=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),deadline:z.number().int().positive()});
/** Owner-only in-process capability. A serialized actor, header or healthy flag
 * cannot recreate it. Requires a caller-owned transaction; its locks remain
 * held until that transaction ends. Normal writes and public login remain closed. */
export async function withOwnerRecoveryReadCapability<T>(client:PoolClient,actor:CurrentSession,raw:z.infer<typeof readProbeScope>,read:()=>Promise<T>){
 const scope=readProbeScope.parse(raw),now=Date.now();
 if(scope.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID||scope.deadline<=now||scope.deadline>now+300000||actor.kind!=='internal'||actor.role!=='admin'||actor.loginName!=='mcteer'||!/^[A-Za-z0-9_-]{43}$/.test(actor.token)||recoveryReadActors.has(actor))throw new HttpFailure(403,'forbidden','Recovery read probe unavailable');
 if((await client.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw new HttpFailure(403,'forbidden','Exact owner recovery read probe required');
 try{await client.query('SAVEPOINT turas_recovery_read_probe');await client.query('RELEASE SAVEPOINT turas_recovery_read_probe');}
 catch{throw new HttpFailure(403,'forbidden','Recovery read probe requires an active transaction');}
 await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[scope.environmentId]);
 const rows=(await client.query(`SELECT c.environment_id FROM operations_control c JOIN turas_environment e ON e.environment_id=c.environment_id
  JOIN login_sessions s ON s.id=$4 AND s.principal_id=$5 AND s.membership_id=$6 AND s.workspace_id=$7
  JOIN memberships m ON m.id=s.membership_id AND m.principal_id=s.principal_id AND m.workspace_id=s.workspace_id
  JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
  WHERE c.environment_id=$1 AND c.mode='locked' AND c.recovery_id=$2 AND c.revision=$3 AND e.schema_version=79
   AND s.token_hash=$8 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND m.active AND p.active AND w.active
   AND m.kind='internal' AND m.role='admin' AND p.login_name='mcteer'
   AND (w.classification='primary' OR w.pilot_environment_id=$1)
   AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) FOR SHARE OF c,s,m,p,w`,[scope.environmentId,scope.recoveryId,scope.controlRevision,actor.sessionId,actor.principalId,actor.membershipId,actor.workspaceId,createHash('sha256').update(actor.token).digest('hex')])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'forbidden','Exact owner recovery read probe required');
 recoveryReadActors.set(actor,{client,environmentId:scope.environmentId,recoveryId:scope.recoveryId,revision:scope.controlRevision,deadline:scope.deadline});
 try{return await read();}finally{recoveryReadActors.delete(actor);}
}
/** The fixed maintenance handler authenticates an actual owner-issued database
 * admission on this direct runtime transaction, never a caller-supplied actor. */
export async function withRecoveryHttpReadCapability<T>(db:PoolClient,request:Request,id:string,read:(actor:CurrentSession,customerId:string)=>Promise<T>){
 const proof=await authenticateRecoveryHttpRead(db,request,id,false);
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[proof.environmentId]);
 recoveryReadActors.set(proof.actor,{client:db,environmentId:proof.environmentId,recoveryId:proof.recoveryId,revision:proof.controlRevision,deadline:proof.deadline});
 try{const result=await read(proof.actor,proof.customerId);await authenticateRecoveryHttpRead(db,request,id,false);return result;}
 finally{recoveryReadActors.delete(proof.actor);}
}
const cancelledPaths=/^(?:\/api\/artifacts\/intents\/[a-f0-9-]{36}\/cancel|\/eve\/v1\/session\/wrun_[A-Za-z0-9_-]+\/cancel)$/;
/** The exception is an in-process capability attached only to a verified session on a fixed cancellation handler. */
export function protectedCancellationRequest(request:Request){return request.method==='POST'&&cancelledPaths.test(new URL(request.url).pathname);}
export function registerProtectedCancellation(request:Request,actor:object){if(!protectedCancellationRequest(request))throw Error('Invalid protected operation');cancellationActors.add(actor);}
export async function requireOperationalOpen(db:PoolClient,actor?:object,readOnly=false){
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[environmentId]);
 const row=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
 const probe=actor?recoveryReadActors.get(actor):undefined;
 if(readOnly&&probe&&probe.client===db&&probe.environmentId===environmentId&&probe.deadline>Date.now()&&row?.mode==='locked'&&row.recovery_id===probe.recoveryId&&Number(row.revision)===probe.revision)return;
 if(!row||row.mode!=='open'&&(!actor||!cancellationActors.has(actor)))throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
}
export async function operationalAdmissionOpen(){try{return (await query("SELECT 1 FROM operations_control WHERE environment_id=$1 AND mode='open'",[getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount===1;}catch{return false;}}
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
