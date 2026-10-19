import {databaseTargetDigest} from './database-binding';
import type {PoolClient} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {operationalCodeVersion} from './code-version';
import {createAuthenticatedOwnerRecoverySession} from './authenticated-recovery-read';

const issueSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),customerId:z.uuid(),deadline:z.number().int().positive(),password:z.string().min(1).max(4096),maximumRequests:z.number().int().min(1).max(10),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/).nullable()});
const hash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
/** Caller owns the owner transaction and eventual retirement. Only the actual
 * authenticated owned-recovery constructor can issue this maintenance session. */
export async function issueOwnedRecoveryHttpRead(db:PoolClient,raw:z.infer<typeof issueSchema>){
 const input=issueSchema.parse(raw),config=getServerConfig();
 if(input.deadline>Date.now()+60000||input.deploymentId!==(process.env.VERCEL_DEPLOYMENT_ID??null)||(process.env.VERCEL==='1'&&!input.deploymentId))throw Error('Exact short-lived recovery deployment required');
 const actor=await createAuthenticatedOwnerRecoverySession(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,workspaceId:input.workspaceId,deadline:input.deadline,password:input.password});
 if(!(await db.query('SELECT 1 FROM customer_references WHERE id=$1 AND workspace_id=$2',[input.customerId,input.workspaceId])).rowCount)throw Error('Exact recovery customer required');
 const id=randomUUID(),secret=randomBytes(32).toString('base64url');
 await db.query(`INSERT INTO operations_recovery_http_reads(id,environment_id,recovery_id,control_revision,session_id,workspace_id,customer_id,source_commit,origin,deployment_id,secret_hash,expires_at,maximum_requests,database_binding_digest)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,input.environmentId,input.recoveryId,input.controlRevision,actor.sessionId,input.workspaceId,input.customerId,operationalCodeVersion(),config.TURAS_APP_ORIGIN,input.deploymentId,hash(secret),new Date(input.deadline),input.maximumRequests,databaseTargetDigest(config.DATABASE_URL,input.environmentId,String((await db.query('SELECT current_database() AS name')).rows[0].name))]);
 return Object.freeze({id,secret,actor,expiresAt:new Date(input.deadline).toISOString()});
}
export async function retireOwnedRecoveryHttpRead(db:PoolClient,id:string){
 z.uuid().parse(id);
 if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Actual recovery owner required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='5000ms'; SET LOCAL transaction_timeout='15s'");
  const target=(await db.query('SELECT environment_id FROM operations_recovery_http_reads WHERE id=$1',[id])).rows;
  if(target.length!==1)throw Error('Exact recovery HTTP admission required');
  await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[target[0].environment_id]);
  const rows=(await db.query('UPDATE operations_recovery_http_reads SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND environment_id=$2 RETURNING session_id',[id,target[0].environment_id])).rows;
  if(rows.length!==1)throw Error('Exact recovery HTTP admission required');
  await db.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[rows[0].session_id]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}
