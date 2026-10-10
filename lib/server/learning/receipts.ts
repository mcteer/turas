import { createHmac, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { getServerConfig } from '../config';
import { HttpFailure } from '../../contracts/http';
import { admitLearningRead } from './limits';
import { learningId } from '../../contracts/learning';
import { learningCanonical, learningHash } from './repository';
function receiptKeys(): Buffer[] {
  let configured: unknown;
  try { configured = process.env.TURAS_014_RECEIPT_HASH_KEYS ? JSON.parse(process.env.TURAS_014_RECEIPT_HASH_KEYS) : [getServerConfig().TURAS_MAINTENANCE_SECRET]; }
  catch { configured = null; }
  if (!Array.isArray(configured) || !configured.length || configured.length>32 || configured.some(value=>typeof value!=='string'||Buffer.byteLength(value)<32))
    throw new HttpFailure(503,'learning_key_unavailable','Learning receipt configuration unavailable');
  return configured.map(value=>createHmac('sha256',value).update('turas-learning-receipts-v1').digest());
}
const keyId=(key:Buffer)=>`v1:${learningHash(key.toString('hex')).slice(0,32)}`;
export const learningKeyId=()=>keyId(receiptKeys()[0]);
/** Stable opaque scope survives key retirement so old requests cannot become fresh. */
export const learningActorHash=(actor:CurrentSession)=>learningHash(['learning-actor-v1',getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,actor.membershipId]);
export const learningInputDigest=(value:unknown,id=learningKeyId())=>{
  const key=receiptKeys().find(key=>keyId(key)===id);
  if(!key)throw new HttpFailure(410,'request_retired','Receipt key is retired');
  return createHmac('sha256',key).update(learningCanonical(value)).digest('hex');
};
export async function lockLearningRequest(db: PoolClient, actor: CurrentSession, requestId: string, wait=true): Promise<boolean> {
  const identity = learningHash(['learning-request-v1',getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,requestId]);
  if(wait){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);return true;}
  return (await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[identity])).rows[0].locked === true;
}
export type LearningReceiptRow = {request_id:string;action:string;input_digest:string;hash_key_id:string;customer_id:string|null;target_id:string|null;version:string|null;outcome:'committed'|'abandoned'|'retired';created_at:Date|null};
export function projectLearningReceipt(row:LearningReceiptRow){return {contractVersion:'learning-v1' as const,requestId:row.request_id,action:row.action,targetId:row.target_id,version:row.version===null?null:Number(row.version),outcome:row.outcome,committedAt:row.created_at?.toISOString()??null};}
export async function findLearningReceipt(db:PoolClient,actor:CurrentSession,requestId:string){return (await db.query<LearningReceiptRow>(`SELECT * FROM learning_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_hash=$3 AND request_id=$4`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,learningActorHash(actor),requestId])).rows[0];}
export function checkLearningReplay(row:LearningReceiptRow,digest:string,action:string){
  if(row.outcome!=='committed')throw new HttpFailure(410,'request_retired','This request cannot be repeated');
  if(row.input_digest!==digest||row.action!==action)throw new HttpFailure(409,'request_conflict','Request identity was already used');
  return projectLearningReceipt(row);
}
export async function storeLearningReceipt(db:PoolClient,actor:CurrentSession,input:{requestId:string;action:string;digest:string;customerId:string|null;targetId:string|null;version:number|null;outcome?:'committed'|'abandoned'|'retired'}){
  const row=(await db.query<LearningReceiptRow>(`INSERT INTO learning_command_receipts(id,environment_id,workspace_id,actor_hash,request_id,action,input_digest,hash_key_id,customer_id,target_id,version,outcome)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,learningActorHash(actor),input.requestId,input.action,input.digest,learningKeyId(),input.customerId,input.targetId,input.version,input.outcome??'committed'])).rows[0];
  return projectLearningReceipt(row);
}

/** Reconciliation holds the identical request mutex; no write quota or redispatch. */
export async function learningRequestStatus(db:PoolClient,actor:CurrentSession,requestId:string,abandon:boolean,
  authorize:(db:PoolClient,row:LearningReceiptRow)=>Promise<void>){
  learningId.parse(requestId);
  await admitLearningRead(db,actor);
  if(!await lockLearningRequest(db,actor,requestId,false))return {contractVersion:'learning-v1' as const,requestId,action:'request.status',targetId:null,version:null,committedAt:null,outcome:'pending' as const};
  const prior=await findLearningReceipt(db,actor,requestId);
  if(prior){await authorize(db,prior);return projectLearningReceipt(prior);}
  if(!abandon)return {contractVersion:'learning-v1' as const,requestId,action:'request.status',targetId:null,version:null,committedAt:null,outcome:'not_found' as const};
  return storeLearningReceipt(db,actor,{requestId,action:'request.resolve',digest:learningInputDigest(['abandoned',requestId]),customerId:null,targetId:null,version:null,outcome:'abandoned'});
}
