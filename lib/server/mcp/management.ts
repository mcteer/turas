import { createHash,randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { mcpCreateConnectionSchema,mcpRevokeConnectionSchema,mcpConnectionMetadataSchema,mcpManagementPageSchema,mcpIdSchema,type McpCreateConnection } from "../../contracts/mcp";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { isMcpReadActor } from "../auth/read-actor";
import type { CurrentSession } from "../auth/sessions";
import { withTransaction } from "../db/client";
import { lockWorkspaceActor,lockProfileActor } from "../profiles/policy";
import { isCanonicalAdmin } from "../access/admin-guard";
import { getServerConfig } from "../config";
import { assertMcpReady } from "./schema";
import { admitMcpManagement } from "./limits";
import { newMcpCredential } from "./credentials";

function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export type McpConnectionRow={id:string;name:string;categories:unknown;created_at:Date;expires_at:Date;revoked_at:Date|null;last_used_at:Date|null};
export function connectionMetadata(row:McpConnectionRow){
  return mcpConnectionMetadataSchema.parse({id:row.id,name:row.name,categories:row.categories,
    createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),revokedAt:row.revoked_at?.toISOString()??null,
    lastUsedAt:row.last_used_at?.toISOString()??null,state:row.revoked_at?'revoked':row.expires_at.getTime()<=Date.now()?'expired':'active'});
}
async function managementAdmission(actor:CurrentSession){
  if(isMcpReadActor(actor))throw new HttpFailure(403,'forbidden','Action not allowed');
  const allowed=await withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,true,2000);
    return admitMcpManagement(db,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId);
  });
  if(!allowed)throw new HttpFailure(429,'limited','Request limit reached',60);
}
async function receipt(db:PoolClient,actor:CurrentSession,key:string,requestDigest:string,action:'create'|'revoke'){
  const row=(await db.query(`SELECT connection_id,request_digest,action FROM mcp_management_receipts
    WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,key])).rows[0];
  if(row && (row.request_digest!==requestDigest || row.action!==action))throw new HttpFailure(409,'conflict','Request key was already used');
  return row;
}
async function saveReceipt(db:PoolClient,actor:CurrentSession,key:string,connectionId:string,requestDigest:string,action:'create'|'revoke'){
  await db.query(`INSERT INTO mcp_management_receipts(request_key,environment_id,workspace_id,actor_membership_id,connection_id,action,request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[key,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,connectionId,action,requestDigest]);
}
export async function createMcpConnection(actor:CurrentSession,raw:McpCreateConnection){
  const input=mcpCreateConnectionSchema.safeParse(raw);if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');
  await managementAdmission(actor);
  return withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,false,2000);
    const requestDigest=digest({action:'create',...input.data}),previous=await receipt(db,actor,input.data.requestKey,requestDigest,'create');
    if(previous){const row=(await db.query('SELECT * FROM mcp_connections WHERE id=$1 AND membership_id=$2 AND workspace_id=$3',[previous.connection_id,actor.membershipId,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return {connection:connectionMetadata(row),secretAvailable:false as const};}
    await assertMcpReady(db,true);
    const count=(await db.query("SELECT count(*)::integer AS n FROM mcp_connections WHERE environment_id=$1 AND membership_id=$2 AND workspace_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()",[getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,actor.workspaceId])).rows[0].n;
    if(count>=10)throw new HttpFailure(409,'conflict','Active connection limit reached');
    for(const customerId of [...input.data.customerIds].sort())await lockProfileActor(db,actor,customerId);
    const credential=newMcpCredential(),scopeDigest=digest({categories:[...input.data.categories].sort(),customerIds:[...input.data.customerIds].sort()});
    const row=(await db.query(`WITH timing AS MATERIALIZED(SELECT clock_timestamp() AS at)
      INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,created_at,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,at,at+$10*interval '1 day' FROM timing RETURNING *`,
      [credential.id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,actor.membershipId,input.data.name,input.data.categories,scopeDigest,credential.hash,input.data.lifetimeDays])).rows[0];
    for(const customerId of input.data.customerIds)await db.query('INSERT INTO mcp_connection_customers(connection_id,workspace_id,customer_id) VALUES($1,$2,$3)',[credential.id,actor.workspaceId,customerId]);
    await saveReceipt(db,actor,input.data.requestKey,credential.id,requestDigest,'create');
    return {connection:connectionMetadata(row),secretAvailable:true as const,credential:credential.credential};
  });
}
export async function revokeMcpConnection(actor:CurrentSession,id:string,raw:{requestKey:string;expectedConnectionId:string}){
  const input=mcpRevokeConnectionSchema.safeParse(raw);if(!input.success || input.data.expectedConnectionId!==id)throw new HttpFailure(422,'invalid_input','Invalid request');
  await managementAdmission(actor);
  return withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,false,2000);
    const row=(await db.query('SELECT * FROM mcp_connections WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
    if(!row || (row.membership_id!==actor.membershipId && !isCanonicalAdmin(actor)))throw hiddenRecord();
    const requestDigest=digest({action:'revoke',id,...input.data}),previous=await receipt(db,actor,input.data.requestKey,requestDigest,'revoke');
    if(!previous){
      if(!row.revoked_at)await db.query('UPDATE mcp_connections SET revoked_at=clock_timestamp(),revoker_membership_id=$2 WHERE id=$1',[id,actor.membershipId]);
      await saveReceipt(db,actor,input.data.requestKey,id,requestDigest,'revoke');
    }
    const current=(await db.query('SELECT * FROM mcp_connections WHERE id=$1',[id])).rows[0];
    return {connection:connectionMetadata(current),secretAvailable:false as const};
  });
}

async function managementCursor(db:PoolClient,actor:CurrentSession,kind:'own'|'admin'|'usage',cursor?:string,connectionId?:string){
  if(!cursor)return undefined;
  if(!/^[A-Za-z0-9_-]{43}$/.test(cursor))throw new HttpFailure(422,'invalid_input','Invalid continuation');
  const row=(await db.query(`SELECT position_id FROM mcp_management_cursors WHERE handle_hash=$1 AND environment_id=$2 AND workspace_id=$3
    AND principal_id=$4 AND membership_id=$5 AND kind=$6 AND connection_id IS NOT DISTINCT FROM $7::uuid AND expires_at>clock_timestamp()`,
    [digest(cursor),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,actor.membershipId,kind,connectionId??null])).rows[0];
  if(!row)throw new HttpFailure(422,'invalid_input','Invalid continuation');return row.position_id as string;
}
async function nextManagementCursor(db:PoolClient,actor:CurrentSession,kind:'own'|'admin'|'usage',position:string,connectionId?:string){
  const handle=randomBytes(32).toString('base64url');
  await db.query(`WITH timing AS MATERIALIZED(SELECT clock_timestamp() AS at)
    INSERT INTO mcp_management_cursors(handle_hash,environment_id,workspace_id,principal_id,membership_id,kind,connection_id,position_id,created_at,expires_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,at,at+interval '15 minutes' FROM timing`,
    [digest(handle),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,actor.membershipId,kind,connectionId??null,position]);
  return handle;
}
export async function listMcpConnections(actor:CurrentSession,raw:{limit:number;cursor?:string},admin=false){
  if(isMcpReadActor(actor) || (admin&&!isCanonicalAdmin(actor)))throw new HttpFailure(403,'forbidden','Action not allowed');
  const input=mcpManagementPageSchema.safeParse(raw);if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');
  return withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,true,2000);
    const kind=admin?'admin':'own',cursor=await managementCursor(db,actor,kind,input.data.cursor);
    const rows=await db.query(`SELECT * FROM mcp_connections WHERE environment_id=$1 AND workspace_id=$2 AND ($3::boolean OR membership_id=$4)
      AND ($5::uuid IS NULL OR id>$5) ORDER BY id LIMIT $6`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,admin,actor.membershipId,cursor??null,input.data.limit+1]);
    const page=rows.rows.slice(0,input.data.limit),connections=[];
    for(const row of page){
      const customers=await db.query<{customerId:string;displayName:string}>(`SELECT c.id AS "customerId",c.display_name AS "displayName"
        FROM mcp_connection_customers ceiling JOIN customer_references c ON c.id=ceiling.customer_id AND c.workspace_id=ceiling.workspace_id
        WHERE ceiling.connection_id=$1 AND ceiling.workspace_id=$2 AND ($3='internal' OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id AND g.membership_id=$4 AND g.state='active')) ORDER BY c.id`,
        [row.id,actor.workspaceId,actor.kind,actor.membershipId]);
      for(const customer of customers.rows)await lockProfileActor(db,actor,customer.customerId,undefined,true);
      connections.push({connection:connectionMetadata(row),customers:customers.rows,...(admin?{ownerMembershipId:row.membership_id}:{})});
    }
    return {connections,nextCursor:rows.rows.length>input.data.limit?await nextManagementCursor(db,actor,kind,page.at(-1)!.id):null,
      serviceState:getServerConfig().TURAS_015_DISABLED==='0'?'ready' as const:'disabled' as const};
  });
}
export async function listMcpUsage(actor:CurrentSession,id:string,raw:{limit:number;cursor?:string}){
  if(isMcpReadActor(actor))throw new HttpFailure(403,'forbidden','Action not allowed');
  const input=mcpManagementPageSchema.safeParse(raw);if(!input.success || !mcpIdSchema.safeParse(id).success)throw new HttpFailure(422,'invalid_input','Invalid request');
  return withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,true,2000);
    const connection=(await db.query('SELECT membership_id FROM mcp_connections WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
    if(!connection || (connection.membership_id!==actor.membershipId&&!isCanonicalAdmin(actor)))throw hiddenRecord();
    const cursor=await managementCursor(db,actor,'usage',input.data.cursor,id);
    const rows=await db.query(`SELECT id AS "requestId",operation,result,created_at AS "createdAt",duration_ms AS "durationMs" FROM mcp_access_receipts
      WHERE connection_id=$1 AND environment_id=$2 AND workspace_id=$3 AND created_at>clock_timestamp()-interval '90 days'
      AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,cursor??null,input.data.limit+1]);
    const page=rows.rows.slice(0,input.data.limit).map(row=>({...row,createdAt:row.createdAt.toISOString()}));
    return {items:page,nextCursor:rows.rows.length>input.data.limit?await nextManagementCursor(db,actor,'usage',page.at(-1)!.requestId,id):null};
  });
}
export async function reconcileMcpRequest(actor:CurrentSession,key:string){
  if(isMcpReadActor(actor) || !mcpIdSchema.safeParse(key).success)throw new HttpFailure(422,'invalid_input','Invalid request');
  return withTransaction(async db=>{
    await assertMcpReady(db);await lockWorkspaceActor(db,actor,undefined,true,2000);
    const row=(await db.query(`SELECT c.* FROM mcp_management_receipts receipt JOIN mcp_connections c ON c.id=receipt.connection_id
      WHERE receipt.request_key=$1 AND receipt.environment_id=$2 AND receipt.workspace_id=$3 AND receipt.actor_membership_id=$4`,
      [key,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];
    return {confirmed:Boolean(row),connection:row?connectionMetadata(row):null,secretAvailable:false as const};
  });
}
