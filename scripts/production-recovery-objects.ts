import {createHash} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import type {CurrentSession} from '../lib/server/auth/sessions';
import {HttpFailure} from '../lib/contracts/http';
import type {WorkCaptureCandidate} from '../lib/contracts/pilot-capture';
import {requiredRecoveryObjects} from '../lib/server/operations/required-objects';
import {verifyRequiredObjects,activeObjectNamespaces} from '../lib/server/storage/inventory';
import {objectKey,verifiedBytes,type PrivateObjects,type ObjectNamespace} from '../lib/server/storage/private-objects';
import {requireArtifactSourceReader} from '../lib/server/artifacts/policy';
import {lockStaffingActor} from '../lib/server/staffing/policy';
import {lockImportIntent} from '../lib/server/staffing/imports';
import {reportHead} from '../lib/server/reports/revisions';
import {lockReportActor} from '../lib/server/reports/policy';
import {reportRevisionFence} from '../lib/server/reports/release';
const need=(value:unknown)=>{if(!value)throw Error('Authenticated recovery object ledger or bytes differ');};
/** Caller has authenticated the archive and restored SQL integrity, and retains
 * the service-state fence. No caller-provided empty/success flag is accepted. */
export async function verifyProductionRecoveryObjects(db:Client,candidate:Pick<WorkCaptureCandidate,'environmentId'|'objects'>,store:PrivateObjects,signal:AbortSignal){
 need(candidate.objects.objectCount===candidate.objects.entries.length&&candidate.objects.objectCount<=256);
 const captured=candidate.objects.entries.map(entry=>{
  const match=/^objects\/([^/]+)\/([^/]+)$/.exec(entry.name);need(match&&activeObjectNamespaces.includes(match[1] as ObjectNamespace));
  return {key:objectKey(candidate.environmentId,match![1] as ObjectNamespace,match![2]),digest:entry.digest,sizeBytes:entry.sizeBytes};
 });need(new Set(captured.map(row=>row.key)).size===captured.length);
 const required=await requiredRecoveryObjects(db,candidate.environmentId);verifyRequiredObjects(captured,required,candidate.environmentId);
 for(const object of captured){signal.throwIfAborted();await verifiedBytes(await store.stream(object.key,object,signal),object,10485760);}
 // Re-read the actual ledger after IO: zero is valid only when both inventories
 // are genuinely empty, and a changed live requirement cannot disappear silently.
 need(JSON.stringify(await requiredRecoveryObjects(db,candidate.environmentId))===JSON.stringify(required));
 return {capturedObjectCount:captured.length,requiredObjectCount:required.length,verifiedObjectCount:captured.length,emptyCaptureAndLedger:captured.length===0&&required.length===0,required,captured};
}
/** Discover normal download paths and test canonical domain eligibility on this
 * exact live cookie. Staging/gap-report/private old versions still receive the
 * complete byte verification above; absence of a normal download grants nothing. */
export async function productionRecoveryHttpFiles(db:Client,environmentId:string,workspaceId:string,headers:Headers){
 const token=/(?:^|;\s*)__Host-turas_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.get('cookie')??'')?.[1];need(token);
 const row=(await db.query(`SELECT s.id AS session_id,s.expires_at,p.id AS principal_id,p.login_name,p.display_name,m.id AS membership_id,m.kind,m.role,m.workspace_id FROM login_sessions s JOIN principals p ON p.id=s.principal_id AND p.active JOIN memberships m ON m.id=s.membership_id AND m.principal_id=p.id AND m.workspace_id=s.workspace_id AND m.active JOIN workspaces w ON w.id=m.workspace_id AND w.active AND w.classification='primary' WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()`,[createHash('sha256').update(token!).digest('hex'),workspaceId])).rows[0];need(row);
 const actor:CurrentSession={sessionId:row.session_id,token:token!,expiresAt:row.expires_at,principalId:row.principal_id,loginName:row.login_name,displayName:row.display_name,membershipId:row.membership_id,workspaceId,kind:row.kind,role:row.role,workspaceClassification:'primary'};
 const candidates=(await db.query(`SELECT 'artifact' AS kind,v.id::text AS id,NULL::text AS parent_id,v.object_key::text AS object_key,v.sha256_digest AS digest,v.actual_size_bytes AS bytes FROM artifact_versions v WHERE v.environment_id=$1 AND v.workspace_id=$2 AND v.state IN('ready','partial') AND EXISTS(SELECT 1 FROM artifact_extraction_runs r WHERE r.version_id=v.id AND r.state='published')
 UNION ALL SELECT 'workforce',i.id::text,NULL::text,v.object_key::text,v.content_digest,v.byte_size FROM workforce_import_intents i JOIN workforce_sources s ON s.id=i.source_id AND s.environment_id=i.environment_id JOIN workforce_source_versions v ON v.id=s.current_version_id AND v.environment_id=s.environment_id WHERE i.environment_id=$1 AND i.workspace_id=$2 AND s.state IN('ready','partial','reviewed') AND EXISTS(SELECT 1 FROM workforce_extractions e WHERE e.source_version_id=v.id AND e.scan_clean)
 UNION ALL SELECT 'report',a.id::text,r.report_id::text,a.object_key::text,a.content_digest,a.size_bytes FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.validation_id IS NOT NULL LIMIT 257`,[environmentId,workspaceId])).rows;need(candidates.length<=256);
 const files: {kind:string;id:string;key:string;digest:string;sizeBytes:number;path:string}[]=[];
 for(const candidate of candidates){
  await db.query('BEGIN');try{
   const client=db as unknown as PoolClient;
   if(candidate.kind==='artifact'){
    const v=(await db.query('SELECT * FROM artifact_versions WHERE id=$1',[candidate.id])).rows[0];
    await requireArtifactSourceReader(client,actor,{environmentId:v.environment_id,workspaceId:v.workspace_id,customerId:v.customer_id,ownerPrincipalId:v.owner_principal_id,submittedAt:v.submitted_at});
   }else if(candidate.kind==='workforce'){
    await lockStaffingActor(client,actor,'manager',{readOnly:true});const intent=await lockImportIntent(client,actor,candidate.id);need(intent.current_version_id&&['ready','partial','reviewed'].includes(intent.source_state)&&intent.filename);
   }else{
    const head=await reportHead(client,actor,candidate.parent_id),metadata=(await db.query('SELECT a.*,EXISTS(SELECT 1 FROM report_publications p WHERE p.revision_id=a.revision_id) AS published FROM report_artifacts a WHERE a.id=$1',[candidate.id])).rows[0];
    await lockReportActor(client,actor,head.customer_id,'read',head.audience,Boolean(metadata.published));const revision=await reportRevisionFence(client,actor.workspaceId,metadata.revision_id,{published:metadata.published});
    if(!['review_ready','published'].includes(revision.state))continue;
    const validation=(await db.query('SELECT artifact_digests FROM report_validations WHERE id=$1 AND revision_id=$2 AND document_digest=$3',[metadata.validation_id,metadata.revision_id,revision.content_digest])).rows[0];need(validation?.artifact_digests?.[metadata.format]===metadata.content_digest);
   }
   files.push({kind:candidate.kind,id:candidate.id,key:objectKey(environmentId,candidate.kind,candidate.object_key),digest:candidate.digest,sizeBytes:Number(candidate.bytes),path:candidate.kind==='artifact'?'/api/artifacts/'+candidate.id+'/original':candidate.kind==='workforce'?'/api/staffing/imports/'+candidate.id+'/content':'/api/reports/artifacts/'+candidate.id});
  }catch(error){if(!(error instanceof HttpFailure)||![403,404].includes(error.status))throw error;}
  finally{await db.query('ROLLBACK');}
 }
 return files;
}
