import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
import {query} from '../db/client';
import {HttpFailure} from '../../contracts/http';

// Ordinary session authentication must not load recovery readers, MCP or the
// domain graph. Keep its fence and cancellation capability shared with admission.
const cancellationActors=new WeakSet<object>();
const cancelledPaths=/^(?:\/api\/artifacts\/intents\/[a-f0-9-]{36}\/cancel|\/eve\/v1\/session\/wrun_[A-Za-z0-9_-]+\/cancel)$/;
export function protectedCancellationRequest(request:Request){return request.method==='POST'&&cancelledPaths.test(new URL(request.url).pathname);}
export function registerProtectedCancellation(request:Request,actor:object){if(!protectedCancellationRequest(request))throw Error('Invalid protected operation');cancellationActors.add(actor);}
export function hasProtectedCancellation(actor:object){return cancellationActors.has(actor);}

export async function operationalControlUnderFence(db:PoolClient){
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[environmentId]);
 const row=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
 return {environmentId,row};
}
export async function requireSessionAdmissionOpen(db:PoolClient){
 const {row}=await operationalControlUnderFence(db);
 if(!row||row.mode!=='open')throw new HttpFailure(503,'recovery_locked','Service temporarily unavailable');
}
export async function operationalAdmissionOpen(){try{return (await query("SELECT 1 FROM operations_control WHERE environment_id=$1 AND mode='open'",[getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount===1;}catch{return false;}}
