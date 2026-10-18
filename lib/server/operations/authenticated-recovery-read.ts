import type {PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {DEMO_IDS} from '../bootstrap-ids';
import {HttpFailure} from '../../contracts/http';
import {verifyConfiguredCredentials} from '../auth/credentials';
import {createSessionToken,hashSessionToken,type CurrentSession} from '../auth/sessions';
import {requireOwnedLockedRecoveryTarget} from './restored-work-integrity';
import {withOwnerRecoveryReadCapability} from './admission';

const inputSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),deadline:z.number().int().positive(),password:z.string().min(1).max(4096)});
/** Protected owned recovery only. Authenticate the configured mcteer credential,
 * create a transaction-local short-lived session and retire it before returning.
 * Ordinary login remains closed. This neither certifies health nor unlocks. */
export async function withAuthenticatedOwnerRecoveryRead<T>(db:PoolClient,raw:z.infer<typeof inputSchema>,read:(actor:CurrentSession)=>Promise<T>):Promise<T>{
 const input=inputSchema.parse(raw),config=getServerConfig();
 if(input.environmentId!==config.TURAS_ENVIRONMENT_ID||input.deadline<=Date.now()||input.deadline>Date.now()+300000)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 // Refuse autocommit before credentials or session creation. The caller owns
 // the final transaction and must keep the target locked through verification.
 await db.query('SAVEPOINT authenticated_recovery_admission');await db.query('RELEASE SAVEPOINT authenticated_recovery_admission');
 if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw new HttpFailure(403,'forbidden','Exact owner recovery authentication required');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[input.environmentId]);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[input.environmentId]);
 await requireOwnedLockedRecoveryTarget(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision});
 if(config.TURAS_DEMO_USERNAME!=='mcteer'||verifyConfiguredCredentials('mcteer',input.password,config)!==DEMO_IDS.mcteer)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const rows=(await db.query(`SELECT p.id AS principal_id,p.login_name,p.display_name,m.id AS membership_id,m.workspace_id,w.classification
  FROM principals p JOIN memberships m ON m.principal_id=p.id JOIN workspaces w ON w.id=m.workspace_id
  WHERE p.id=$1 AND p.login_name='mcteer' AND p.active AND m.active AND w.active AND m.kind='internal' AND m.role='admin' AND w.id=$2
   AND (w.classification='primary' OR (w.classification='synthetic_pilot' AND w.pilot_environment_id=$3)) FOR SHARE OF p,m,w`,[DEMO_IDS.mcteer,input.workspaceId,input.environmentId])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 if(input.deadline<=now.getTime()||input.deadline>now.getTime()+300000)throw new HttpFailure(403,'forbidden','Recovery authentication unavailable');
 const row=rows[0],sessionId=randomUUID(),token=createSessionToken(),expiresAt=new Date(input.deadline);
 await db.query('INSERT INTO login_sessions(id,principal_id,token_hash,created_at,expires_at,membership_id,workspace_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[sessionId,row.principal_id,hashSessionToken(token),now,expiresAt,row.membership_id,row.workspace_id]);
 const actor:CurrentSession=Object.freeze({principalId:row.principal_id,loginName:row.login_name,displayName:row.display_name,membershipId:row.membership_id,workspaceId:row.workspace_id,workspaceClassification:row.classification,kind:'internal',role:'admin',sessionId,token,expiresAt});
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
