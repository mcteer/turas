import type {Client,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {DEMO_IDS} from '../bootstrap-ids';
import {HttpFailure} from '../../contracts/http';
import {verifyConfiguredCredentials} from '../auth/credentials';
import {createSessionToken,hashSessionToken,type CurrentSession} from '../auth/sessions';
import {requireOwnedLockedRecoveryTarget} from './restored-work-integrity';
import {requireLockedWorkRecoveryConnection,reserveWorkRecoveryProbe,withWorkRecoveryProbeIssuance,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {withAuthenticatedMcpRecoveryReadCapability,withParticipantRecoveryReadCapability,withOwnerRecoveryReadCapability} from './admission';

const inputSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),deadline:z.number().int().positive(),password:z.string().min(1).max(4096)});
/** Operator-only constructor. Requires the caller's owner transaction and exact
 * owned locked target. The caller must retire this new session on every exit. */
export function createAuthenticatedOwnerRecoverySession(db:PoolClient,raw:z.infer<typeof inputSchema>):Promise<CurrentSession>{
 return createRecoverySession(db,raw,async input=>{await requireOwnedLockedRecoveryTarget(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision});});
}
async function createRecoverySession(db:PoolClient,raw:z.infer<typeof inputSchema>,authorizeTarget:(input:z.infer<typeof inputSchema>)=>Promise<void>,prepare?:(owner:{membershipId:string;workspaceId:string})=>Promise<{sessionId:string;token:string}>,username:'mcteer'|'panel'|'partner'='mcteer'):Promise<CurrentSession>{
 const input=inputSchema.parse(raw),config=getServerConfig();
 if(input.environmentId!==config.TURAS_ENVIRONMENT_ID||input.deadline<=Date.now()||input.deadline>Date.now()+300000)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 // Refuse autocommit before credentials or session creation. The caller owns
 // the final transaction and must keep the target locked through verification.
 await db.query('SAVEPOINT authenticated_recovery_admission');await db.query('RELEASE SAVEPOINT authenticated_recovery_admission');
 if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw new HttpFailure(403,'forbidden','Exact owner recovery authentication required');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[input.environmentId]);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[input.environmentId]);
 await authorizeTarget(input);
 const principalId=DEMO_IDS[username];
 if((username==='mcteer'&&config.TURAS_DEMO_USERNAME!=='mcteer')||verifyConfiguredCredentials(username,input.password,config)!==principalId)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const rows=(await db.query(`SELECT p.id AS principal_id,p.login_name,p.display_name,m.id AS membership_id,m.workspace_id,m.kind,m.role,w.classification
  FROM principals p JOIN memberships m ON m.principal_id=p.id JOIN workspaces w ON w.id=m.workspace_id
  WHERE p.id=$1 AND p.login_name=$4 AND p.active AND m.active AND w.active AND w.id=$2
   AND (($4='mcteer' AND m.kind='internal' AND m.role='admin') OR ($4='panel' AND m.kind='internal') OR ($4='partner' AND m.kind='partner' AND EXISTS(SELECT 1 FROM partner_organizations o WHERE o.id=m.partner_org_id AND o.workspace_id=m.workspace_id AND o.active)))
   AND (w.classification='primary' OR (w.classification='synthetic_pilot' AND w.pilot_environment_id=$3)) FOR SHARE OF p,m,w`,[principalId,input.workspaceId,input.environmentId,username])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 if(input.deadline<=now.getTime()||input.deadline>now.getTime()+300000)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const row=rows[0],prepared=prepare?await prepare({membershipId:row.membership_id,workspaceId:row.workspace_id}):{sessionId:randomUUID(),token:createSessionToken()},sessionId=prepared.sessionId,token=prepared.token,expiresAt=new Date(input.deadline);
 const createdAt=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;if(input.deadline<=createdAt.getTime()||input.deadline>createdAt.getTime()+300000)throw new HttpFailure(403,'forbidden','Recovery authentication expired');
 await db.query('INSERT INTO login_sessions(id,principal_id,token_hash,created_at,expires_at,membership_id,workspace_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[sessionId,row.principal_id,hashSessionToken(token),createdAt,expiresAt,row.membership_id,row.workspace_id]);
 const actor:CurrentSession=Object.freeze({principalId:row.principal_id,loginName:row.login_name,displayName:row.display_name,membershipId:row.membership_id,workspaceId:row.workspace_id,workspaceClassification:row.classification,kind:row.kind,role:row.role,sessionId,token,expiresAt});
 return actor;
}
/** Protected owned recovery only. Authenticate the configured mcteer credential,
 * create a transaction-local short-lived session and retire it before returning.
 * Ordinary login remains closed. This neither certifies health nor unlocks. */
export async function withAuthenticatedOwnerRecoveryRead<T>(db:PoolClient,raw:z.infer<typeof inputSchema>,read:(actor:CurrentSession)=>Promise<T>):Promise<T>{
 const input=inputSchema.parse(raw),actor=await createAuthenticatedOwnerRecoverySession(db,input),sessionId=actor.sessionId;
 await db.query('SAVEPOINT authenticated_recovery_read');
 try{
  const result=await withOwnerRecoveryReadCapability(db,actor,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,deadline:input.deadline},()=>read(actor));
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[sessionId]);
  await db.query('RELEASE SAVEPOINT authenticated_recovery_read');
  return result;
 }catch(error){
  // Recover even a SQL-aborted callback so no live probe credential can survive
  // if the owner elects to commit its other recovery observations.
  await db.query('ROLLBACK TO SAVEPOINT authenticated_recovery_read');await db.query('RELEASE SAVEPOINT authenticated_recovery_read');
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[sessionId]);
  throw error;
 }
}

/** Work counterpart: authority comes from the genuine platform-bound target;
 * the original owned constructor retains its Docker and selected-cluster guard. */
export async function createAuthenticatedWorkRecoverySession(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>,journalDirectory:string){
 return createWorkRecoverySession(db,target,raw,journalDirectory,'mcteer');
}
export async function createAuthenticatedWorkParticipantSession(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>&{username:'panel'|'partner'},journalDirectory:string){
 const {username,...scope}=raw;return createWorkRecoverySession(db,target,inputSchema.parse(scope),journalDirectory,z.enum(['panel','partner']).parse(username));
}
/** A new finite bearer identity, never a captured credential restored to service. */
export async function createAuthenticatedWorkMcpProbeSession(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>&{username:'mcteer'|'panel'|'partner';mcp:NonNullable<Parameters<typeof reserveWorkRecoveryProbe>[2]['mcp']>},journalDirectory:string){
 const {username,mcp,...scope}=raw;return createWorkRecoverySession(db,target,inputSchema.parse(scope),journalDirectory,z.enum(['mcteer','panel','partner']).parse(username),mcp);
}
async function createWorkRecoverySession(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>,journalDirectory:string,username:'mcteer'|'panel'|'partner',mcp?:NonNullable<Parameters<typeof reserveWorkRecoveryProbe>[2]['mcp']>){
 return withWorkRecoveryProbeIssuance(db,target,async()=>{
 const input=inputSchema.parse(raw);if(input.deadline>target.deadline||input.deadline>Date.now()+60000)throw new HttpFailure(403,'forbidden','Short-lived work recovery authentication required');
 let probe:Awaited<ReturnType<typeof reserveWorkRecoveryProbe>>|undefined;
 const actor=await createRecoverySession(db as unknown as PoolClient,input,async scope=>{await requireLockedWorkRecoveryConnection(db,target,{environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision});},async owner=>{probe=await reserveWorkRecoveryProbe(db,target,{...owner,journalDirectory,...(mcp?{mcp}:{})});return {sessionId:probe.sessionId,token:probe.sessionToken};},username);
 if(!probe)throw Error('Registered work recovery credential required');
 return Object.freeze({actor,probe});
 });
}
export async function withAuthenticatedWorkRecoveryRead<T>(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>,journalDirectory:string,read:(actor:CurrentSession)=>Promise<T>):Promise<T>{
 const input=inputSchema.parse(raw),{actor}=await createAuthenticatedWorkRecoverySession(db,target,input,journalDirectory),client=db as unknown as PoolClient;
 await db.query('SAVEPOINT authenticated_work_recovery_read');
 try{
  const result=await withOwnerRecoveryReadCapability(client,actor,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,deadline:input.deadline},()=>read(actor));
  await requireLockedWorkRecoveryConnection(db,target,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision});
  await withOwnerRecoveryReadCapability(client,actor,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,deadline:input.deadline},async()=>{});
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[actor.sessionId]);await db.query('RELEASE SAVEPOINT authenticated_work_recovery_read');return result;
 }catch(error){await db.query('ROLLBACK TO SAVEPOINT authenticated_work_recovery_read');await db.query('RELEASE SAVEPOINT authenticated_work_recovery_read');await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[actor.sessionId]);throw error;}
}

/** Authenticate each configured participant independently. The owner connection
 * is transport authority only; all customer and audience policy uses this actor. */
export async function withAuthenticatedWorkParticipantRead<T>(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof inputSchema>&{username:'panel'|'partner'},journalDirectory:string,read:(actor:CurrentSession)=>Promise<T>):Promise<T>{
 const username=z.enum(['panel','partner']).parse(raw.username),{username:_,...scope}=raw,input=inputSchema.parse(scope);
 if(input.deadline>target.deadline||input.deadline>Date.now()+60000)throw new HttpFailure(403,'forbidden','Short-lived work recovery authentication required');
 const targetScope={environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision},readScope={...targetScope,deadline:input.deadline};
 const {actor}=await createAuthenticatedWorkParticipantSession(db,target,{...input,username},journalDirectory);
 const client=db as unknown as PoolClient;
 await db.query('SAVEPOINT authenticated_participant_recovery_read');
 try{
  const result=await withParticipantRecoveryReadCapability(client,actor,readScope,()=>read(actor));
  await requireLockedWorkRecoveryConnection(db,target,targetScope);
  await withParticipantRecoveryReadCapability(client,actor,readScope,async()=>{});
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[actor.sessionId]);await db.query('RELEASE SAVEPOINT authenticated_participant_recovery_read');return result;
 }catch(error){await db.query('ROLLBACK TO SAVEPOINT authenticated_participant_recovery_read');await db.query('RELEASE SAVEPOINT authenticated_participant_recovery_read');await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[actor.sessionId]);throw error;}
}

/** Existing bearer only: no credential is created, renewed, or revoked here. */
export async function withAuthenticatedWorkMcpRead<T>(db:Client,target:LockedWorkRecoveryTarget,authorization:string|null,deadline:number,read:(actor:import('../auth/read-actor').McpReadActor)=>Promise<T>):Promise<T>{
 const scope={environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision};
 if(deadline>target.deadline)throw new HttpFailure(403,'forbidden','Exact work MCP recovery deadline required');
 await requireLockedWorkRecoveryConnection(db,target,scope);
 const result=await withAuthenticatedMcpRecoveryReadCapability(db as unknown as PoolClient,authorization,{...scope,deadline},read);
 await requireLockedWorkRecoveryConnection(db,target,scope);return result;
}
