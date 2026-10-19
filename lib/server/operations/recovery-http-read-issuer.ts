import {readExecutionRecoveryBinding} from './recovery-execution-read';
import {databaseTargetDigest} from './database-binding';
import type {Client,PoolClient} from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {operationalCodeVersion} from './code-version';
import type {CurrentSession} from '../auth/sessions';
import {requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {createAuthenticatedWorkParticipantSession,createAuthenticatedWorkRecoverySession,createAuthenticatedOwnerRecoverySession} from './authenticated-recovery-read';

const issueSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),customerId:z.uuid().nullable(),deadline:z.number().int().positive(),password:z.string().min(1).max(4096),maximumRequests:z.number().int().min(1).max(10),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/).nullable(),readKind:z.enum(['profile','artifact','report','workforce','gap','plan','execution','mcp']).default('profile'),recordId:z.uuid().optional()});
const hash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
/** Caller owns the owner transaction and eventual retirement. Only the actual
 * authenticated owned-recovery constructor can issue this maintenance session. */
export async function issueOwnedRecoveryHttpRead(db:PoolClient,raw:z.input<typeof issueSchema>){
 const input=issueSchema.parse(raw),config=getServerConfig();
 if(input.deadline>Date.now()+60000||input.deploymentId!==(process.env.VERCEL_DEPLOYMENT_ID??null)||(process.env.VERCEL==='1'&&!input.deploymentId))throw Error('Exact short-lived recovery deployment required');
 return issueRecoveryHttpRead(db,input,async()=>({actor:await createAuthenticatedOwnerRecoverySession(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,workspaceId:input.workspaceId,deadline:input.deadline,password:input.password})}),{sourceCommit:operationalCodeVersion(),origin:config.TURAS_APP_ORIGIN,deploymentId:input.deploymentId,databaseBindingDigest:databaseTargetDigest(config.DATABASE_URL,input.environmentId,String((await db.query('SELECT current_database() AS name')).rows[0].name))});
}
type HttpBinding={sourceCommit:string;origin:string;deploymentId:string|null;databaseBindingDigest:string};
async function issueRecoveryHttpRead(db:PoolClient,input:z.infer<typeof issueSchema>,authenticate:()=>Promise<{actor:CurrentSession;probe?:{admissionId:string;admissionSecret:string}}>,binding:HttpBinding){
 if((input.readKind==='profile')!==!input.recordId)throw Error('Exact recovery read kind and record required');
 if((['workforce','gap','mcp'].includes(input.readKind))!==(input.customerId===null))throw Error('Exact customer or workspace recovery scope required');
 const {actor,probe}=await authenticate();
 if(input.customerId!==null&&!(await db.query('SELECT 1 FROM customer_references WHERE id=$1 AND workspace_id=$2',[input.customerId,input.workspaceId])).rowCount)throw Error('Exact recovery customer required');
 let record:{sha256_digest:string;actual_size_bytes:string|null;lifecycle_generation:string;parent_id?:string;revision_id?:string}|undefined;
 if(input.readKind==='mcp'){record=(await db.query(`SELECT scope_digest AS sha256_digest,NULL::text AS actual_size_bytes,1::text AS lifecycle_generation,membership_id AS parent_id FROM mcp_connections WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND membership_id=$4 AND principal_id=$5 AND revoked_at IS NULL AND credential_hash IS NOT NULL AND expires_at>clock_timestamp() FOR SHARE`,[input.recordId,input.environmentId,input.workspaceId,actor.membershipId,actor.principalId])).rows[0];if(!record)throw Error('Exact active recovery MCP connection required');}
 if(input.readKind==='execution'){if(!input.customerId||!input.recordId)throw Error('Exact execution recovery scope required');const binding=await readExecutionRecoveryBinding(db,{environmentId:input.environmentId,workspaceId:input.workspaceId,customerId:input.customerId,engagementId:input.recordId});record={sha256_digest:binding.bindingDigest,actual_size_bytes:null,lifecycle_generation:String(binding.generation),parent_id:binding.baseline.active_baseline_id,revision_id:binding.baseline.revision_id};}
 if(input.readKind==='plan'){record=(await db.query(`SELECT v.content_digest AS sha256_digest,NULL::text AS actual_size_bytes,p.aggregate_version AS lifecycle_generation,v.id AS revision_id FROM delivery_plans p JOIN plan_revisions v ON v.id=p.accepted_revision_id WHERE p.id=$1 AND p.environment_id=$2 AND p.workspace_id=$3 AND p.customer_id=$4 AND (SELECT state FROM plan_revision_events WHERE revision_id=v.id ORDER BY event_order DESC LIMIT 1)='accepted'`,[input.recordId,input.environmentId,input.workspaceId,input.customerId])).rows[0];if(!record)throw Error('Exact accepted recovery plan required');}
 if(input.readKind==='artifact'){record=(await db.query(`SELECT sha256_digest,actual_size_bytes,lifecycle_generation FROM artifact_versions v WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND state IN('ready','partial') AND (owner_principal_id=$5 OR submitted_at IS NOT NULL) AND EXISTS(SELECT 1 FROM artifact_extraction_runs r WHERE r.version_id=v.id AND r.state='published')`,[input.recordId,input.environmentId,input.workspaceId,input.customerId,actor.principalId])).rows[0];if(!record)throw Error('Exact readable recovery artifact required');}
 if(input.readKind==='report'){record=(await db.query(`SELECT a.content_digest AS sha256_digest,a.size_bytes AS actual_size_bytes,v.revision_number AS lifecycle_generation,v.report_id AS parent_id,v.id AS revision_id FROM report_artifacts a JOIN report_revisions v ON v.id=a.revision_id JOIN report_revision_states st ON st.revision_id=v.id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.customer_id=$4 AND a.validation_id IS NOT NULL AND st.state IN('review_ready','published')`,[input.recordId,input.environmentId,input.workspaceId,input.customerId])).rows[0];if(!record)throw Error('Exact readable recovery report artifact required');}
 if(input.readKind==='workforce'){record=(await db.query(`SELECT v.content_digest AS sha256_digest,v.byte_size AS actual_size_bytes,s.generation AS lifecycle_generation,s.id AS parent_id,v.id AS revision_id FROM workforce_import_intents i JOIN workforce_sources s ON s.id=i.source_id JOIN workforce_source_versions v ON v.id=s.current_version_id WHERE i.id=$1 AND i.environment_id=$2 AND i.workspace_id=$3 AND i.owner_membership_id=$4 AND i.state='completed' AND s.state IN('ready','partial','reviewed') AND s.environment_id=i.environment_id AND s.workspace_id=i.workspace_id AND v.environment_id=i.environment_id AND v.workspace_id=i.workspace_id AND v.source_id=s.id AND v.generation=s.generation AND v.object_key=i.id::text AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.source_version_id=v.id AND x.scan_clean)`,[input.recordId,input.environmentId,input.workspaceId,actor.membershipId])).rows[0];if(!record)throw Error('Exact readable recovery workforce original required');}
 if(input.readKind==='gap'){record=(await db.query(`SELECT a.content_digest AS sha256_digest,a.size_bytes AS actual_size_bytes,r.version AS lifecycle_generation,r.id AS parent_id,r.current_revision_id AS revision_id FROM gap_export_receipts e JOIN gap_export_artifacts a ON a.id=e.artifact_id JOIN gap_reports r ON r.id=e.report_id JOIN gap_report_reviews review ON review.id=e.review_id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 AND e.actor_membership_id=$4 AND e.state<>'cancelled' AND a.environment_id=e.environment_id AND a.workspace_id=e.workspace_id AND a.report_id=r.id AND a.revision_id=r.current_revision_id AND a.content_digest=e.content_digest AND a.size_bytes=e.size_bytes AND r.environment_id=e.environment_id AND r.workspace_id=e.workspace_id AND r.approved_review_id=e.review_id AND review.revision_id=r.current_revision_id AND review.action='approve' AND review.audience_digest=e.audience_digest`,[input.recordId,input.environmentId,input.workspaceId,actor.membershipId])).rows[0];if(!record)throw Error('Exact approved recovery gap export required');}
 const id=probe?.admissionId??randomUUID(),secret=probe?.admissionSecret??randomBytes(32).toString('base64url');
 await db.query(`INSERT INTO operations_recovery_http_reads(id,environment_id,recovery_id,control_revision,session_id,workspace_id,customer_id,source_commit,origin,deployment_id,secret_hash,expires_at,maximum_requests,database_binding_digest,read_kind,record_id,record_digest,record_size,record_generation,record_parent_id,record_revision_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[id,input.environmentId,input.recoveryId,input.controlRevision,actor.sessionId,input.workspaceId,input.customerId,binding.sourceCommit,binding.origin,binding.deploymentId,hash(secret),new Date(input.deadline),input.maximumRequests,binding.databaseBindingDigest,input.readKind,input.recordId??null,record?.sha256_digest??null,record?.actual_size_bytes==null?null:Number(record.actual_size_bytes),record?Number(record.lifecycle_generation):null,record?.parent_id??null,record?.revision_id??null]);
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

/** Exact hosted target counterpart; local operator deployment variables never
 * substitute for the independently verified serving deployment and database. */
export async function issueWorkRecoveryHttpRead(db:Client,target:LockedWorkRecoveryTarget,raw:z.input<typeof issueSchema>,journalDirectory:string){
 const input=issueSchema.parse(raw);
 if(input.deadline>target.deadline||input.deadline>Date.now()+60000||input.deploymentId!==target.deploymentId)throw Error('Exact short-lived work recovery deployment required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision});
 return issueRecoveryHttpRead(db as unknown as PoolClient,input,()=>createAuthenticatedWorkRecoverySession(db,target,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,workspaceId:input.workspaceId,deadline:input.deadline,password:input.password},journalDirectory),{sourceCommit:target.sourceCommit,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
}

/** Same finite HTTP protocol, authenticated as the actual participant. Ordinary
 * ingress and the owned mcteer-only constructor retain their existing guards. */
export async function issueWorkParticipantRecoveryHttpRead(db:Client,target:LockedWorkRecoveryTarget,raw:z.input<typeof issueSchema>&{username:'panel'|'partner'},journalDirectory:string){
 const {username:provided,...scope}=raw,username=z.enum(['panel','partner']).parse(provided),input=issueSchema.parse(scope);
 if(input.deadline>target.deadline||input.deadline>Date.now()+60000||input.deploymentId!==target.deploymentId)throw Error('Exact short-lived work recovery deployment required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision});
 return issueRecoveryHttpRead(db as unknown as PoolClient,input,()=>createAuthenticatedWorkParticipantSession(db,target,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,workspaceId:input.workspaceId,deadline:input.deadline,password:input.password,username},journalDirectory),{sourceCommit:target.sourceCommit,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
}
