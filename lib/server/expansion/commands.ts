import {expansionReceiptSchema,expansionOutput} from './projection-schema';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {lockWorkspaceActor} from '../profiles/policy';
import {lockExpansionActor,requireExpansionEnvironment,type ExpansionActor} from './policy';
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 const result=JSON.stringify(value);if(result===undefined)throw Error('Unsupported expansion digest input');return result;
}
export function expansionHash(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
export function expansionOpaqueHashes(identity:readonly string[]){
 let keys:unknown=process.env.TURAS_011_RECEIPT_HASH_KEYS?JSON.parse(process.env.TURAS_011_RECEIPT_HASH_KEYS):[getServerConfig().TURAS_MAINTENANCE_SECRET];
 if(!Array.isArray(keys)||!keys.length||keys.length>32||keys.some(k=>typeof k!=='string'||Buffer.byteLength(k)<32))throw new HttpFailure(503,'key_unavailable','Expansion receipt configuration unavailable');
 return keys.map((key:string)=>createHmac('sha256',key).update(canonical(identity)).digest('hex'));
}
export async function lockExpansionCommandKey(db:PoolClient,actor:ExpansionActor,requestKey:string){
 const identity=[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,requestKey];
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`expansion-command:${expansionHash(identity)}`]);
 const hashes=expansionOpaqueHashes(identity);
 if((await db.query('SELECT 1 FROM expansion_expired_command_keys WHERE key_hash=ANY($1::text[])',[hashes])).rowCount)throw new HttpFailure(409,'expired_receipt','This request key has expired; reconcile before new work');
 return hashes;
}
export type ExpansionReceipt={id:string;operation:string;customerId:string;recordId:string|null;revisionId:string|null;decisionId:string|null;outcome:string;version:number};
export async function expansionReceipt(db:PoolClient,actor:ExpansionActor,customerId:string,key:string,digest?:string):Promise<ExpansionReceipt|null>{
 const row=(await db.query('SELECT * FROM expansion_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4',[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,key])).rows[0];
 if(!row)return null;if(row.customer_id!==customerId)throw hiddenRecord();
 if(digest&&row.request_digest!==digest)throw new HttpFailure(409,'idempotency_conflict','Request key already used with different input');
 return expansionOutput(expansionReceiptSchema,{id:row.id,operation:row.operation,customerId:row.customer_id,recordId:row.record_id,revisionId:row.revision_id,decisionId:row.decision_id,outcome:row.outcome,version:Number(row.version)});
}
export async function saveExpansionReceipt(db:PoolClient,actor:ExpansionActor,customerId:string,key:string,digest:string,result:Omit<ExpansionReceipt,'id'|'customerId'>){
 const id=randomUUID();await db.query(`INSERT INTO expansion_command_receipts(id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,request_digest,operation,record_id,revision_id,decision_id,outcome,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,key,digest,result.operation,result.recordId,result.revisionId,result.decisionId,result.outcome,result.version]);return expansionOutput(expansionReceiptSchema,{id,customerId,...result});
}
export async function enforceExpansionRate(db:PoolClient,actor:ExpansionActor,kind:'read'|'write'){
 const env=getServerConfig().TURAS_ENVIRONMENT_ID,key=expansionOpaqueHashes(['rate',env,actor.workspaceId,actor.membershipId,kind])[0];
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`expansion-rate:${key}`]);
 const now=Date.now(),start=new Date(now),max=kind==='read'?120:30;
 const total=Number((await db.query('SELECT COALESCE(sum(count),0) AS count FROM rate_windows WHERE environment_id=$1 AND key_hash=$2 AND category=$3 AND window_start>$4',[env,key,`expansion_${kind}`,new Date(now-60000)])).rows[0].count);
 if(total>=max)throw new HttpFailure(429,'rate_limited','Expansion request limit reached',60);
 await db.query(`INSERT INTO rate_windows(environment_id,key_hash,category,window_start,count,expires_at) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(environment_id,key_hash,category,window_start) DO UPDATE SET count=rate_windows.count+1`,[env,key,`expansion_${kind}`,start,new Date(now+60000)]);
}
export async function readExpansionReceipt(actor:ExpansionActor,key:string){
 // Admission persists even when the receipt is still absent. Wait for any writer
 // before discovering its customer, then acquire the full authority prefix anew.
 await withTransaction(async db=>{
  if(actor.kind!=='internal')throw hiddenRecord();
  await lockWorkspaceActor(db,actor,undefined,true);await requireExpansionEnvironment(db);
  await enforceExpansionRate(db,actor,'read');
 });
 const customerId=await withTransaction(async db=>{
  await lockWorkspaceActor(db,actor,undefined,true);await requireExpansionEnvironment(db);
  await lockExpansionCommandKey(db,actor,key);
  const row=(await db.query('SELECT customer_id FROM expansion_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4',[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,key])).rows[0];
  if(!row)throw hiddenRecord();return row.customer_id as string;
 });
 return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);await lockExpansionCommandKey(db,actor,key);
  const receipt=await expansionReceipt(db,actor,customerId,key);if(!receipt)throw hiddenRecord();return receipt;
 });
}
/** Quota commits before source work; a failed business transaction cannot undo admission. */
export async function admitExpansionRequest(actor:ExpansionActor,customerId:string,kind:'read'|'write'){
 await withTransaction(async db=>{await lockExpansionActor(db,actor,customerId);if(kind==='write'){
  await requireExpansionEnvironment(db,true);
 }await enforceExpansionRate(db,actor,kind);});
}
export async function admitExpansionCommand(actor:ExpansionActor,customerId:string,key:string,digest:string){
 await withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);await lockExpansionCommandKey(db,actor,key);
  const prior=await expansionReceipt(db,actor,customerId,key,digest);
  if(!prior)await requireExpansionEnvironment(db,true);
  await enforceExpansionRate(db,actor,prior?'read':'write');
 });
}
