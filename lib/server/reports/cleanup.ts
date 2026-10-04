import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {requireReportEnvironment} from './readiness';
import {deleteExactReportObject,reportStoreRoot} from './store';
import {lstat,opendir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {reportId} from './schema';

/** Queue exact immutable payload identities; newer corrections are never targets. */
export async function queueReportRevisionCleanup(db:PoolClient,revisionId:string){
 await requireReportEnvironment(db);
 const row=(await db.query(`SELECT r.*,s.generation,s.visibility FROM report_revisions r
  JOIN report_revision_states s ON s.revision_id=r.id
  WHERE r.id=$1 AND r.environment_id=$2 FOR SHARE OF s`,[revisionId,process.env.TURAS_ENVIRONMENT_ID])).rows[0];
 if(!row || !['withheld','expired'].includes(row.visibility))return;
 const payloads=(await db.query(`SELECT 'revision' AS kind,r.content_digest AS digest FROM report_revisions r
  JOIN report_revision_payloads p ON p.revision_id=r.id WHERE r.id=$1
   UNION ALL SELECT 'mail',content_digest FROM report_mail_payloads WHERE revision_id=$1
   UNION ALL SELECT 'calculation',input_digest FROM report_calculations WHERE revision_id=$1`,[revisionId])).rows;
 for(const payload of payloads)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,now()) ON CONFLICT DO NOTHING`,
   [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,revisionId,payload.kind,payload.digest,row.generation,row.visibility]);
 const files=(await db.query("SELECT object_key,content_digest FROM report_store_objects WHERE revision_id=$1 AND state<>'deleted'",[revisionId])).rows;
  for(const file of files)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,$5,'artifact',$6,$7,$8,$9,now()) ON CONFLICT DO NOTHING`,
   [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,revisionId,file.object_key,file.content_digest,row.generation,row.visibility]);
  const decisions=(await db.query('SELECT d.id,d.rationale_digest FROM report_decisions d JOIN report_decision_payloads p ON p.decision_id=d.id WHERE p.revision_id=$1',[revisionId])).rows;
  for(const decision of decisions)await db.query(`INSERT INTO report_cleanup_jobs
   (id,environment_id,workspace_id,customer_id,revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
   VALUES($1,$2,$3,$4,$5,'decision',$6,$7,$8,$9,now()) ON CONFLICT DO NOTHING`,
   [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,revisionId,decision.id,decision.rationale_digest,row.generation,row.visibility]);
}

/** Disabled reporting still permits exact lease-fenced payload cleanup. */
export async function cleanupReportRevisionPayloads(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const expired=(await db.query(`SELECT s.revision_id FROM report_revision_states s
  JOIN report_revisions r ON r.id=s.revision_id WHERE r.environment_id=$1
  AND s.payload_expires_at<=now() AND s.visibility NOT IN ('withheld','expired')
  ORDER BY s.payload_expires_at,s.revision_id LIMIT $2 FOR UPDATE OF s SKIP LOCKED`,
  [process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const row of expired){
  await db.query("UPDATE report_revision_states SET visibility='expired',generation=generation+1,reason_code='retention_expired',updated_at=now() WHERE revision_id=$1",[row.revision_id]);
  await queueReportRevisionCleanup(db,row.revision_id);
 }
  const privatePayloads=(await db.query(`SELECT 'delivery' AS kind,d.id,d.environment_id,d.workspace_id,d.customer_id,d.payload_digest AS digest,NULL::uuid AS revision_id
  FROM report_delivery_payloads p JOIN report_deliveries d ON d.id=p.delivery_id WHERE d.environment_id=$1 AND p.expires_at<=now()
   UNION ALL SELECT 'recipient',p.id,policy.environment_id,policy.workspace_id,policy.customer_id,p.recipient_digest,NULL::uuid
  FROM report_policy_recipients p JOIN report_recipient_policies policy ON policy.id=p.policy_revision_id WHERE policy.environment_id=$1 AND p.expires_at<=now()
   UNION ALL SELECT 'decision',d.id,d.environment_id,d.workspace_id,d.customer_id,d.rationale_digest,p.revision_id
   FROM report_decision_payloads p JOIN report_decisions d ON d.id=p.decision_id WHERE d.environment_id=$1 AND p.expires_at<=now()
   LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const payload of privatePayloads)await db.query(`INSERT INTO report_cleanup_jobs
   (id,environment_id,workspace_id,customer_id,revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'retention_expired',now()) ON CONFLICT DO NOTHING`,
   [randomUUID(),payload.environment_id,payload.workspace_id,payload.customer_id,payload.revision_id,payload.kind,payload.id,payload.digest]);
 const jobs=(await db.query(`SELECT id FROM report_cleanup_jobs WHERE environment_id=$1
    AND payload_kind IN ('revision','mail','recipient','delivery','decision','calculation') AND due_at<=now()
  AND (state='queued' OR (state='leased' AND lease_until<=now()))
  ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){
  const token=randomUUID();
  await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  const result=(await db.query('SELECT turas_report_purge_revision($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,job.id,token])).rows[0];
  if(result.purged)purged++;
 }
 return {claimed:jobs.length,purged};
}

/** Lock the exact cause before deletion; never enumerate another store's namespace. */
export async function cleanupReportFiles(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const jobs=(await db.query(`SELECT j.* FROM report_cleanup_jobs j WHERE j.environment_id=$1
  AND j.payload_kind='artifact' AND j.due_at<=now() AND (j.state='queued' OR (j.state='leased' AND j.lease_until<=now()))
  ORDER BY j.due_at,j.id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){
  const state=(await db.query('SELECT generation,visibility FROM report_revision_states WHERE revision_id=$1 FOR SHARE',[job.revision_id])).rows[0];
  if(!state || String(state.generation)!==String(job.cause_generation) || !['withheld','expired'].includes(state.visibility)){
   await db.query("UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=$1",[job.id]);continue;
  }
  const token=randomUUID();await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  const file=(await db.query("SELECT * FROM report_store_objects WHERE object_key=$1 AND revision_id=$2 AND environment_id=$3 AND content_digest=$4 FOR UPDATE",[job.payload_id,job.revision_id,job.environment_id,job.payload_digest])).rows[0];
  if(!file){await db.query("UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=$1",[job.id]);continue;}
  await reportStoreRoot();
  try{await deleteExactReportObject(file.object_key,file.content_digest,Number(file.size_bytes));}
  catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;}
  await db.query("UPDATE report_store_objects SET state='deleted' WHERE object_key=$1",[file.object_key]);
  await db.query("UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",[job.id,token]);purged++;
 }
 return {claimed:jobs.length,purged};
}

/** Reconcile only expired catalogued staging identities, never arbitrary files. */
export async function cleanupStagedReportObjects(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT o.* FROM report_store_objects o WHERE o.environment_id=$1 AND o.state='staged'
  AND o.expires_at<=now() AND NOT EXISTS(SELECT 1 FROM report_artifacts a WHERE a.object_key=o.object_key)
  AND NOT EXISTS(SELECT 1 FROM report_jobs j WHERE j.revision_id=o.revision_id AND j.kind='render'
   AND j.state='leased' AND j.lease_until>now() AND j.deadline_at>now())
  ORDER BY o.expires_at,o.object_key LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const row of rows){
  try{await deleteExactReportObject(row.object_key,row.content_digest,Number(row.size_bytes));}
  catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;}
  await db.query("UPDATE report_store_objects SET state='deleted' WHERE object_key=$1 AND state='staged' AND content_digest=$2",[row.object_key,row.content_digest]);purged++;
 }
 return {claimed:rows.length,purged};
}

/** Old scratch requires its private marker and an expired exact render lease. */
export async function cleanupReportScratch(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);const root=join(await reportStoreRoot(),'scratch');
 const stat=await lstat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(!stat)return {inspected:0,purged:0};
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.mode&0o077)throw new HttpFailure(503,'store_unavailable','Private scratch unavailable');
 const directory=await opendir(root);let inspected=0,purged=0;
 try{
  while(inspected<limit){const entry=await directory.read();if(!entry)break;inspected++;
   if(!entry.isDirectory()||!/^render-[a-zA-Z0-9]+$/.test(entry.name))continue;
   const path=join(root,entry.name),markerPath=join(path,'.turas-report-scratch.json');
   const markerStat=await lstat(markerPath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!markerStat||!markerStat.isFile()||markerStat.isSymbolicLink()||markerStat.mode&0o077||markerStat.size>4096||markerStat.mtimeMs>Date.now()-3600000)continue;
   let marker;try{marker=JSON.parse(await readFile(markerPath,'utf8'));}catch{continue;}
   if(marker.environmentId!==process.env.TURAS_ENVIRONMENT_ID||!reportId.safeParse(marker.jobId).success||!reportId.safeParse(marker.leaseToken).success)continue;
   const job=(await db.query(`SELECT state,lease_token,lease_until>now() AS live FROM report_jobs WHERE id=$1 AND environment_id=$2 AND kind='render' FOR SHARE`,[marker.jobId,marker.environmentId])).rows[0];
   if(!job||(job.state==='leased'&&job.lease_token===marker.leaseToken&&job.live))continue;
   const current=await lstat(path);if(!current.isDirectory()||current.isSymbolicLink()||current.mode&0o077)continue;
   await rm(path,{recursive:true});purged++;
  }
 }finally{await directory.close();}
 return {inspected,purged};
}

/** Exact leased minimization, preserving only receipt identity/namespace/digest. */
export async function cleanupReportReceiptAudit(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT * FROM report_command_receipts WHERE environment_id=$1
  AND created_at<=now()-interval '730 days' AND action<>'expired'
  ORDER BY created_at,id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const row of rows)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,'audit_receipt',$5,$6,1,'audit_retention_v2',now()) ON CONFLICT DO NOTHING`,
  [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,row.id,row.input_digest]);
 const jobs=(await db.query(`SELECT id FROM report_cleanup_jobs WHERE environment_id=$1 AND payload_kind='audit_receipt'
  AND due_at<=now() AND (state='queued' OR (state='leased' AND lease_until<=now()))
  ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){const token=randomUUID();
  await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  if((await db.query('SELECT turas_report_purge_receipt_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,job.id,token])).rows[0].purged)purged++;
 }
 return {claimed:jobs.length,purged};
}

/** Purge provider diagnostics under an exact lease, retaining send deduplication. */
export async function cleanupReportDeliveryAudit(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT * FROM report_deliveries WHERE environment_id=$1
  AND created_at<=now()-interval '730 days' AND audit_expired_at IS NULL
  AND (lease_until IS NULL OR lease_until<=now())
  ORDER BY created_at,id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const row of rows)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,'audit_delivery',$5,$6,1,'audit_retention_v2',now()) ON CONFLICT DO NOTHING`,
  [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,row.id,row.payload_digest]);
 const jobs=(await db.query(`SELECT id FROM report_cleanup_jobs WHERE environment_id=$1 AND payload_kind='audit_delivery'
  AND due_at<=now() AND (state='queued' OR (state='leased' AND lease_until<=now()))
  ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){const token=randomUUID();
  await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  if((await db.query('SELECT turas_report_purge_delivery_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,job.id,token])).rows[0].purged)purged++;
 }
  return {claimed:jobs.length,purged};
}

/** Minimize expired review audit while retaining exact approval/lineage links. */
export async function cleanupReportDecisionAudit(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT * FROM report_decisions WHERE environment_id=$1
  AND created_at<=now()-interval '730 days' AND audit_expired_at IS NULL
  ORDER BY created_at,id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const row of rows)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,'audit_decision',$5,$6,1,'audit_retention_v2',now()) ON CONFLICT DO NOTHING`,
  [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,row.id,row.rationale_digest]);
 const jobs=(await db.query(`SELECT id FROM report_cleanup_jobs WHERE environment_id=$1 AND payload_kind='audit_decision'
  AND due_at<=now() AND (state='queued' OR (state='leased' AND lease_until<=now()))
  ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){const token=randomUUID();
  await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  if((await db.query('SELECT turas_report_purge_decision_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,job.id,token])).rows[0].purged)purged++;
 }
 return {claimed:jobs.length,purged};
}

/** Content-free unmatched IDs have a 24-hour quarantine, never a report identity. */
export async function cleanupUnmatchedReportEvents(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT id,provider_event_id FROM report_delivery_events WHERE environment_id=$1
  AND delivery_id IS NULL AND verified_at<=now()-interval '24 hours'
  ORDER BY verified_at,id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const row of rows){
  const digest=createHash('sha256').update(row.provider_event_id).digest('hex');
  if((await db.query('SELECT turas_report_purge_unmatched_event($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,row.id,digest])).rows[0].purged)purged++;
 }
 return {claimed:rows.length,purged};
}

/** Keep content-free correction links, not obsolete revision attribution/watches. */
export async function cleanupReportRevisionAudit(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT v.*,s.generation FROM report_revisions v JOIN report_revision_states s ON s.revision_id=v.id
  WHERE v.environment_id=$1 AND v.created_at<=now()-interval '730 days' AND v.audit_expired_at IS NULL
  AND s.visibility IN ('expired','withheld') AND s.payload_expires_at<=now()
  AND NOT EXISTS(SELECT 1 FROM report_revision_payloads WHERE revision_id=v.id)
  AND NOT EXISTS(SELECT 1 FROM report_mail_payloads WHERE revision_id=v.id)
  AND NOT EXISTS(SELECT 1 FROM report_calculations WHERE revision_id=v.id)
  AND NOT EXISTS(SELECT 1 FROM report_store_objects WHERE revision_id=v.id AND state<>'deleted')
  ORDER BY v.created_at,v.id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 for(const row of rows)await db.query(`INSERT INTO report_cleanup_jobs
  (id,environment_id,workspace_id,customer_id,revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at)
  VALUES($1,$2,$3,$4,$5,'audit_revision',$5,$6,$7,'audit_retention_v2',now()) ON CONFLICT DO NOTHING`,
  [randomUUID(),row.environment_id,row.workspace_id,row.customer_id,row.id,row.content_digest,row.generation]);
 const jobs=(await db.query(`SELECT id FROM report_cleanup_jobs WHERE environment_id=$1 AND payload_kind='audit_revision'
  AND due_at<=now() AND (state='queued' OR (state='leased' AND lease_until<=now()))
  ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const job of jobs){const token=randomUUID();
  await db.query("UPDATE report_cleanup_jobs SET state='leased',lease_token=$2,lease_until=now()+interval '180 seconds' WHERE id=$1",[job.id,token]);
  if((await db.query('SELECT turas_report_purge_revision_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,job.id,token])).rows[0].purged)purged++;
 }
 return {claimed:jobs.length,purged};
}

/** Preview identities are ephemeral; approvals retain their exact binding digest. */
export async function cleanupExpiredReportPreviews(db:PoolClient,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpFailure(422,'invalid_input','Invalid cleanup batch');
 await requireReportEnvironment(db);
 const rows=(await db.query(`SELECT id,binding_digest FROM report_previews WHERE environment_id=$1
  AND expires_at<=now() ORDER BY expires_at,id LIMIT $2`,[process.env.TURAS_ENVIRONMENT_ID,limit])).rows;
 let purged=0;
 for(const row of rows)if((await db.query('SELECT turas_report_purge_preview($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,row.id,row.binding_digest])).rows[0].purged)purged++;
 return {claimed:rows.length,purged};
}
