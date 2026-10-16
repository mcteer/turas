import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {hiddenRecord} from '../../contracts/http';
export type OperationsReadKind='engagement'|'portfolio'|'capacity';
/** Preserve every consumed semantic value; only fresh projection clocks differ. */
export function operationsReadDigest(value:unknown):string{
 const normalize=(v:unknown,path=''):unknown=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map((item,index)=>normalize(item,path+'/'+index)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([key])=>!(key==='asOf'&&(/^$|^\/summary$|^\/engagements\/\d+(\/summary)?$|^\/capacity\/\d+\/calendar$/.test(path)))).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalize(item,path+'/'+key)])):v;
 return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}
export async function registerOperationsRead(db:PoolClient,scope:{actor:CurrentSession;attemptId:string;general:boolean},kind:OperationsReadKind,input:unknown,output:unknown,customerIds:readonly string[]){
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 await db.query(`INSERT INTO ordinary_operations_read_dependencies(id,environment_id,workspace_id,attempt_id,kind,input,input_digest,snapshot_digest)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(attempt_id,kind,input_digest,snapshot_digest) DO NOTHING`,[randomUUID(),env,scope.actor.workspaceId,scope.attemptId,kind,input,operationsReadDigest(input),operationsReadDigest(output)]);
 if(scope.general)for(const customerId of new Set(customerIds))await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
 SELECT $1,customer_id,$3,CASE WHEN $3='internal' THEN internal_generation ELSE delivery_generation END,'{}'::text[] FROM customer_profile_state WHERE customer_id=$2 AND workspace_id=$4
 ON CONFLICT(attempt_id,customer_id) DO NOTHING`,[scope.attemptId,customerId,scope.actor.kind==='internal'?'internal':'delivery',scope.actor.workspaceId]);
}
/** Used for both next-provider/stream release and persisted owner history. Re-read
 * through current canonical policy, never trust an old capability or payload. */
export async function assertOperationsReadsCurrent(db:PoolClient,actor:CurrentSession,conversationId:string){
 const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];if(!marker||marker.schema_version<75)return;
 const rows=(await db.query(`SELECT d.kind,d.input,d.snapshot_digest FROM ordinary_operations_read_dependencies d JOIN response_attempts a ON a.id=d.attempt_id JOIN conversations c ON c.id=a.conversation_id WHERE c.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4 ORDER BY d.id`,[conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
 if(!rows.length)return;
 const {readOperationsSnapshot}=await import('./reads');
 for(const row of rows){const output=await readOperationsSnapshot(db,actor,row.kind,row.input);if(operationsReadDigest(output)!==row.snapshot_digest)throw hiddenRecord();}
}
