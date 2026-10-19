import {databaseTargetDigest} from './database-binding';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {operationalCodeVersion} from './code-version';
import {type CurrentSession,tokenFromRequest,hashSessionToken} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';

const hash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
export type RecoveryHttpRead={actor:CurrentSession;customerId:string|null;environmentId:string;recoveryId:string;controlRevision:number;deadline:number;readKind:'profile'|'artifact'|'report'|'workforce'|'gap'|'plan';recordId:string|null;recordDigest:string|null;recordSize:number|null;recordGeneration:number|null;recordParentId:string|null;recordRevisionId:string|null};
/** Only the fixed maintenance endpoint calls this. No ordinary route/session or
 * serialized actor receives recovery authority. Caller holds a transaction. */
export async function authenticateRecoveryHttpRead(db:PoolClient,request:Request,id:string,reserve:boolean):Promise<RecoveryHttpRead>{
 const url=new URL(request.url),config=getServerConfig(),secret=request.headers.get('x-turas-recovery-read'),token=tokenFromRequest(request);
 if(!z.uuid().safeParse(id).success)throw new HttpFailure(403,'recovery_request_denied','Recovery read unavailable');
 if(request.method!=='GET'||!['profile','artifact','report','workforce','gap','plan'].some(kind=>url.pathname===`/api/operations/recovery-read/${id}/${kind}`)||request.headers.get('host')!==new URL(config.TURAS_APP_ORIGIN).host||url.search||request.headers.has('range')||!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret)||!token)throw new HttpFailure(403,'recovery_request_denied','Recovery read unavailable');
 request.signal.throwIfAborted();
 await db.query('SAVEPOINT recovery_http_read_admission');await db.query('RELEASE SAVEPOINT recovery_http_read_admission');
 await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL transaction_timeout='15s'");
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,16017))',[config.TURAS_ENVIRONMENT_ID]);
 const admission=(await db.query(`SELECT id FROM operations_recovery_http_reads
  WHERE id=$1 AND secret_hash=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()
   AND session_id=(SELECT id FROM login_sessions WHERE token_hash=$3)
  FOR ${reserve?'UPDATE':'SHARE'}`,[id,hash(secret),hashSessionToken(token)])).rows;
 if(admission.length!==1)throw new HttpFailure(403,'recovery_scope_denied','Recovery read unavailable');
 const rows=(await db.query(`SELECT a.read_kind,a.record_id,a.record_digest,a.record_size,a.record_generation,a.record_parent_id,a.record_revision_id,a.customer_id,a.environment_id,a.recovery_id,a.control_revision,a.expires_at,a.maximum_requests,a.used_requests,
 s.id AS session_id,s.principal_id,s.membership_id,s.workspace_id,p.login_name,p.display_name,w.classification
 FROM operations_recovery_http_reads a JOIN operations_control c USING(environment_id) JOIN turas_environment e USING(environment_id)
 JOIN login_sessions s ON s.id=a.session_id JOIN memberships m ON m.id=s.membership_id AND m.principal_id=s.principal_id AND m.workspace_id=s.workspace_id
 JOIN principals p ON p.id=s.principal_id JOIN workspaces w ON w.id=s.workspace_id LEFT JOIN customer_references cr ON cr.id=a.customer_id AND cr.workspace_id=w.id
 WHERE a.id=$1 AND a.secret_hash=$2 AND s.token_hash=$3 AND a.environment_id=$4 AND a.origin=$5 AND a.source_commit=$6
 AND a.database_binding_digest=$8 AND current_database()=$9
 AND a.deployment_id IS NOT DISTINCT FROM $7::text AND a.workspace_id=s.workspace_id
 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
 AND c.mode='locked' AND c.recovery_id=a.recovery_id AND c.revision=a.control_revision AND e.schema_version=79
 AND current_user='turas_runtime_016' AND session_user='turas_runtime_016'
 AND m.active AND p.active AND w.active AND m.kind='internal' AND m.role='admin' AND p.login_name='mcteer'
 AND ((a.read_kind IN('workforce','gap') AND a.customer_id IS NULL) OR (a.read_kind NOT IN('workforce','gap') AND cr.id IS NOT NULL))
 AND (a.read_kind='profile' OR a.read_kind='plan' AND EXISTS(SELECT 1 FROM delivery_plans p JOIN plan_revisions v ON v.id=p.accepted_revision_id WHERE p.id=a.record_id AND p.environment_id=a.environment_id AND p.workspace_id=a.workspace_id AND p.customer_id=a.customer_id AND p.aggregate_version=a.record_generation AND v.id=a.record_revision_id AND v.content_digest=a.record_digest AND (SELECT state FROM plan_revision_events WHERE revision_id=v.id ORDER BY event_order DESC LIMIT 1)='accepted') OR a.read_kind='artifact' AND EXISTS(SELECT 1 FROM artifact_versions v WHERE v.id=a.record_id AND v.environment_id=a.environment_id AND v.workspace_id=a.workspace_id AND v.customer_id=a.customer_id AND v.sha256_digest=a.record_digest AND v.actual_size_bytes=a.record_size AND v.lifecycle_generation=a.record_generation) OR a.read_kind='report' AND EXISTS(SELECT 1 FROM report_artifacts ra JOIN report_revisions rv ON rv.id=ra.revision_id WHERE ra.id=a.record_id AND ra.environment_id=a.environment_id AND ra.workspace_id=a.workspace_id AND ra.customer_id=a.customer_id AND ra.content_digest=a.record_digest AND ra.size_bytes=a.record_size AND rv.revision_number=a.record_generation AND rv.id=a.record_revision_id AND rv.report_id=a.record_parent_id) OR a.read_kind='workforce' AND EXISTS(SELECT 1 FROM workforce_import_intents i JOIN workforce_sources ws ON ws.id=i.source_id JOIN workforce_source_versions v ON v.id=ws.current_version_id WHERE i.id=a.record_id AND i.environment_id=a.environment_id AND i.workspace_id=a.workspace_id AND i.owner_membership_id=s.membership_id AND i.state='completed' AND ws.id=a.record_parent_id AND ws.environment_id=a.environment_id AND ws.workspace_id=a.workspace_id AND ws.generation=a.record_generation AND ws.state IN('ready','partial','reviewed') AND v.id=a.record_revision_id AND v.environment_id=a.environment_id AND v.workspace_id=a.workspace_id AND v.source_id=ws.id AND v.generation=ws.generation AND v.object_key=i.id::text AND v.content_digest=a.record_digest AND v.byte_size=a.record_size AND EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.source_version_id=v.id AND x.scan_clean)) OR a.read_kind='gap' AND EXISTS(SELECT 1 FROM gap_export_receipts ge JOIN gap_export_artifacts ga ON ga.id=ge.artifact_id JOIN gap_reports gr ON gr.id=ge.report_id JOIN gap_report_reviews review ON review.id=ge.review_id WHERE ge.id=a.record_id AND ge.environment_id=a.environment_id AND ge.workspace_id=a.workspace_id AND ge.actor_membership_id=s.membership_id AND ge.state<>'cancelled' AND ga.environment_id=a.environment_id AND ga.workspace_id=a.workspace_id AND ga.report_id=a.record_parent_id AND ga.revision_id=a.record_revision_id AND ga.content_digest=a.record_digest AND ga.size_bytes=a.record_size AND ge.content_digest=ga.content_digest AND ge.size_bytes=ga.size_bytes AND gr.id=a.record_parent_id AND gr.environment_id=a.environment_id AND gr.workspace_id=a.workspace_id AND gr.current_revision_id=a.record_revision_id AND gr.version=a.record_generation AND gr.approved_review_id=ge.review_id AND review.revision_id=a.record_revision_id AND review.action='approve' AND review.audience_digest=ge.audience_digest))
 AND (w.classification='primary' OR (w.classification='synthetic_pilot' AND w.pilot_environment_id=a.environment_id))
 FOR SHARE OF s,m,p,w`,[id,hash(secret),hashSessionToken(token),config.TURAS_ENVIRONMENT_ID,config.TURAS_APP_ORIGIN,operationalCodeVersion(),process.env.VERCEL_DEPLOYMENT_ID??null,databaseTargetDigest(config.DATABASE_URL,config.TURAS_ENVIRONMENT_ID),decodeURIComponent(new URL(config.DATABASE_URL).pathname.slice(1))])).rows;
 if(rows.length!==1||(process.env.VERCEL==='1'&&!process.env.VERCEL_DEPLOYMENT_ID))throw new HttpFailure(403,'recovery_scope_denied','Recovery read unavailable');
 const row=rows[0];if(url.pathname!==`/api/operations/recovery-read/${id}/${row.read_kind}`)throw new HttpFailure(403,'recovery_scope_denied','Recovery read unavailable');
 const remaining=row.expires_at.getTime()-Date.now();
 if(remaining<=0||remaining>60000)throw new HttpFailure(403,'forbidden','Recovery read unavailable');
 await db.query("SELECT set_config('transaction_timeout',$1,true),set_config('statement_timeout',$2,true)",[Math.max(1,remaining)+'ms',Math.max(1,Math.min(5000,remaining))+'ms']);
 request.signal.throwIfAborted();
 if(reserve){const updated=await db.query('UPDATE operations_recovery_http_reads SET used_requests=used_requests+1 WHERE id=$1 AND used_requests<maximum_requests RETURNING id',[id]);if(updated.rowCount!==1)throw new HttpFailure(429,'rate_limited','Recovery read limit reached');}
 return {actor:Object.freeze({principalId:row.principal_id,loginName:row.login_name,displayName:row.display_name,membershipId:row.membership_id,workspaceId:row.workspace_id,workspaceClassification:row.classification,kind:'internal',role:'admin',sessionId:row.session_id,token,expiresAt:row.expires_at}),customerId:row.customer_id,environmentId:row.environment_id,recoveryId:row.recovery_id,controlRevision:Number(row.control_revision),deadline:row.expires_at.getTime(),readKind:row.read_kind,recordId:row.record_id,recordDigest:row.record_digest,recordSize:row.record_size===null?null:Number(row.record_size),recordGeneration:row.record_generation===null?null:Number(row.record_generation),recordParentId:row.record_parent_id,recordRevisionId:row.record_revision_id};
}
