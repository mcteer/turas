import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
import {query} from '../db/client';
import {HttpFailure} from '../../contracts/http';
const cancellationActors=new WeakSet<object>();
const cancelledPaths=/^(?:\/api\/artifacts\/intents\/[a-f0-9-]{36}\/cancel|\/eve\/v1\/session\/wrun_[A-Za-z0-9_-]+\/cancel)$/;
/** The exception is an in-process capability attached only to a verified session on a fixed cancellation handler. */
export function protectedCancellationRequest(request:Request){return request.method==='POST'&&cancelledPaths.test(new URL(request.url).pathname);}
export function registerProtectedCancellation(request:Request,actor:object){if(!protectedCancellationRequest(request))throw Error('Invalid protected operation');cancellationActors.add(actor);}
export async function requireOperationalOpen(db:PoolClient,actor?:object){
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[environmentId]);
 const row=(await db.query('SELECT mode FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
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
