import {databaseTargetDigest} from './database-binding';
import type {PoolClient} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {operationalCodeVersion} from './code-version';
import {createAuthenticatedOwnerRecoverySession} from './authenticated-recovery-read';

const issueSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),customerId:z.uuid().nullable(),deadline:z.number().int().positive(),password:z.string().min(1).max(4096),maximumRequests:z.number().int().min(1).max(10),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/).nullable(),readKind:z.enum(['profile','artifact','report','workforce']).default('profile'),recordId:z.uuid().optional()});
const hash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
/** Caller owns the owner transaction and eventual retirement. Only the actual
 * authenticated owned-recovery constructor can issue this maintenance session. */
export async function issueOwnedRecoveryHttpRead(db:PoolClient,raw:z.input<typeof issueSchema>){
 const input=issueSchema.parse(raw),config=getServerConfig();
 if(input.deadline>Date.now()+60000||input.deploymentId!==(process.env.VERCEL_DEPLOYMENT_ID??null)||(process.env.VERCEL==='1'&&!input.deploymentId))throw Error('Exact short-lived recovery deployment required');
 if((input.readKind==='profile')!==!input.recordId)throw Error('Exact recovery read kind and record required');
 if((input.readKind==='workforce')!==(input.customerId===null))throw Error('Exact customer or workspace recovery scope required');
 const actor=await createAuthenticatedOwnerRecoverySession(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,workspaceId:input.workspaceId,deadline:input.deadline,password:input.password});
 if(input.customerId!==null&&!(await db.query('SELECT 1 FROM customer_references WHERE id=$1 AND workspace_id=$2',[input.customerId,input.workspaceId])).rowCount)throw Error('Exact recovery customer required');
 let record:{sha256_digest:string;actual_size_bytes:string;lifecycle_generation:string;parent_id?:string;revision_id?:string}|undefined;
 if(input.readKind==='artifact'){record=(await db.query(`SELECT sha256_digest,actual_size_bytes,lifecycle_generation FROM artifact_versions v WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND state IN('ready','partial') AND (owner_principal_id=$5 OR submitted_at IS NOT NULL) AND EXISTS(SELECT 1 FROM artifact_extraction_runs r WHERE r.version_id=v.id AND r.state='published')`,[input.recordId,input.environmentId,input.workspaceId,input.customerId,actor.principalId])).rows[0];if(!record)throw Error('Exact readable recovery artifact required');}
 if(input.readKind==='report'){record=(await db.query(`SELECT a.content_digest AS sha256_digest,a.size_bytes AS actual_size_bytes,v.revision_number AS lifecycle_generation,v.report_id AS parent_id,v.id AS revision_id FROM report_artifacts a JOIN report_revisions v ON v.id=a.revision_id JOIN report_revision_states st ON st.revision_id=v.id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.customer_id=$4 AND a.validation_id IS NOT NULL AND st.state IN('review_ready','published')`,[input.recordId,input.environmentId,input.workspaceId,input.customerId])).rows[0];if(!record)throw Error('Exact readable recovery report artifact required');}
 if(input.readKind==='workforce'){record=(await db.query(`SELECT v.content_digest AS sha256_digest,v.byte_size AS actual_size_bytes,s.generation AS lifecycle_generation,s.id AS parent_id,v.id AS revision_id FROM workforce_import_intents i JOIN workforce_sources s ON s.id=i.source_id JOIN workforce_source_versions v ON v.id=s.current_version_id WHERE i.id=$1 AND i.environment_id=$2 AND i.workspace_id=$3 AND i.owner_membership_id=$4 AND i.state='completed' AND s.state IN('ready','partial','reviewed') AND s.environment_id=i.environment_id AND s.workspace_id=i.workspace_id AND v.environment_id=i.environment_id AND v.workspace_id=i.workspace_id AND v.source_id=s.id AND v.generation=s.generation AND v.object_key=i.id::text AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.source_version_id=v.id AND x.scan_clean)`,[input.recordId,input.environmentId,input.workspaceId,actor.membershipId])).rows[0];if(!record)throw Error('Exact readable recovery workforce original required');}
 const id=randomUUID(),secret=randomBytes(32).toString('base64url');
 await db.query(`INSERT INTO operations_recovery_http_reads(id,environment_id,recovery_id,control_revision,session_id,workspace_id,customer_id,source_commit,origin,deployment_id,secret_hash,expires_at,maximum_requests,database_binding_digest,read_kind,record_id,record_digest,record_size,record_generation,record_parent_id,record_revision_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[id,input.environmentId,input.recoveryId,input.controlRevision,actor.sessionId,input.workspaceId,input.customerId,operationalCodeVersion(),config.TURAS_APP_ORIGIN,input.deploymentId,hash(secret),new Date(input.deadline),input.maximumRequests,databaseTargetDigest(config.DATABASE_URL,input.environmentId,String((await db.query('SELECT current_database() AS name')).rows[0].name)),input.readKind,input.recordId??null,record?.sha256_digest??null,record?Number(record.actual_size_bytes):null,record?Number(record.lifecycle_generation):null,record?.parent_id??null,record?.revision_id??null]);
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
