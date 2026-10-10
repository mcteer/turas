import { randomBytes,randomUUID,createHash } from "node:crypto";
import { Pool,type PoolClient } from "pg";
import { requireOwnedMcpDatabase } from "../../../scripts/mcp-environment";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import type { McpReadActor } from "../../../lib/server/auth/read-actor";
import { hashSessionToken } from "../../../lib/server/auth/sessions";
import { submitProfileCommand } from '../../../lib/server/profiles/service';

export async function withMcpDatabase<T>(run:(db:PoolClient)=>Promise<T>,owner=true):Promise<T>{
  const pool=new Pool({connectionString:requireOwnedMcpDatabase(process.env,owner),max:5});
  try{const db=await pool.connect();try{return await run(db);}finally{db.release();}}finally{await pool.end();}
}
export async function mcpFixture(db:PoolClient,kind:"internal"|"partner"="internal"){
  requireOwnedMcpDatabase(process.env,true);
  const workspaceId=randomUUID(),customerId=randomUUID(),principalId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),connectionId=randomUUID(),organizationId=randomUUID();
  await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic MCP workspace')",[workspaceId]);
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic MCP customer',true)",[customerId,workspaceId]);
  await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic MCP member')",[principalId,'synthetic-mcp-'+principalId]);
  if(kind==='partner')await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic MCP organization')",[organizationId,workspaceId]);
  await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,$4,'member',$5)",[membershipId,principalId,workspaceId,kind,kind==='partner'?organizationId:null]);
  if(kind==='partner')await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),membershipId,workspaceId,customerId,DEMO_IDS.mcteer]);
  const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+3600000),scopeDigest=createHash('sha256').update(connectionId).digest('hex');
  await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",[sessionId,principalId,hashSessionToken(token),expiresAt]);
  const identity={principalId,membershipId,workspaceId,kind,role:'member' as const,loginName:'synthetic-mcp-'+principalId,displayName:'Synthetic MCP member'};
  const browser:CurrentSession={...identity,sessionId,token,expiresAt};
  const actor:McpReadActor={...identity,authority:'mcp',connectionId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,categories:['profiles','evidence','knowledge','plans','reports'],scopeDigest,expiresAt};
  await db.query('BEGIN');
  try {
    await db.query("INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,expires_at) VALUES($1,$2,$3,$4,$5,'Synthetic MCP connection',$6,$7,$8,$9)",[connectionId,actor.environmentId,workspaceId,principalId,membershipId,actor.categories,scopeDigest,hashSessionToken(randomBytes(32).toString('base64url')),expiresAt]);
    await db.query("INSERT INTO mcp_connection_customers(connection_id,workspace_id,customer_id) VALUES($1,$2,$3)",[connectionId,workspaceId,customerId]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  return {actor,browser,customerId,organizationId};
}
export async function mcpInternalPeer(db:PoolClient,workspaceId:string,canonical=false,role:'member'|'admin'='member'):Promise<CurrentSession>{
  requireOwnedMcpDatabase(process.env,true);
  const principalId=canonical?DEMO_IDS.mcteer:randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+3600000);
  const loginName=canonical?'mcteer':'synthetic-mcp-peer-'+principalId;
  if(!canonical)await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic MCP peer')",[principalId,loginName]);
  await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal',$4)",[membershipId,principalId,workspaceId,canonical?'admin':role]);
  await db.query('INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[sessionId,principalId,hashSessionToken(token),expiresAt]);
  return {principalId,membershipId,workspaceId,sessionId,token,expiresAt,loginName,displayName:'Synthetic MCP peer',kind:'internal',role:canonical?'admin':role};
}
export async function mcpAcceptedFact(db:PoolClient,author:CurrentSession,reviewer:CurrentSession,customerId:string,options:{accepted?:boolean;audience?:'internal'|'delivery';observedAt?:string;category?:'delivery_context'|'commercial'|'personnel'}={}){
  requireOwnedMcpDatabase(process.env,true);
  const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),workloadId:null,
    requestedAudience:options.audience??'delivery',dataCategory:options.category??'delivery_context',
    payload:{kind:'product_use',productKey:'synthetic-mcp-'+randomUUID(),displayName:'Synthetic MCP Product',state:'actual',usageDescription:'Observed synthetic engineering delivery evidence',observedAt:options.observedAt??new Date(Date.now()-1000).toISOString()},
    qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Synthetic primary observation',directnessRationale:'Direct synthetic evidence',corroborationRationale:'One independent source',informationType:'adoption_process',dateBasis:'observation'}},db) as {recordId:string;revisionId:string};
  const row=(await db.query('SELECT v.content_digest,v.revision_number,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
  if(options.accepted!==false)await submitProfileCommand(reviewer,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:row.content_digest,
    expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Separately reviewed synthetic original'},db);
  return {recordId:proposed.recordId,revisionId:proposed.revisionId,generation:Number(row.revision_number),digest:row.content_digest};
}
