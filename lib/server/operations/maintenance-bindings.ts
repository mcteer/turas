import {processOrdinaryNativeRetirement} from '../conversations/native-retirement-recovery';
import {cleanupNativeUploads} from '../conversations/native-uploads';
import type {AttachSessionFn} from 'eve/channels';
import {randomUUID} from 'node:crypto';
import {query} from '../db/client';
import {getServerConfig} from '../config';
import {runLocalReconciliation} from './local-reconciliation';
import {maintenanceClasses,type MaintenanceBinding,type MaintenanceTick} from './maintenance';
import {claimDueJobs,finishDueJob,heartbeatWorker} from '../conversations/watchdog';
import {performMaintenance} from '../conversations/maintenance';
import {claimArtifactCleanup,runArtifactCleanup,reconcileExpiredArtifactIntents,reconcileArtifactOrphans} from '../artifacts/cleanup';
import {processNativeRetirement} from '../artifacts/native-retirement';
import {runWorkforceCleanupTick} from '../staffing/cleanup';
import {expireStaffingReservations} from '../staffing/reservations';
import {settleDueStaffingAdvisories} from '../staffing/advisory-maintenance';
import {runRetrievalCleanupTick} from '../retrieval/cleanup';
import {runRetrievalLifecycleTick} from '../../../scripts/retrieval-worker';
import {markDueResearch,researchReviewMarkingFromSql} from '../research/refresh';
import {suspendStaleKnowledge} from '../knowledge/suspension';
import {runPlanCleanupTick} from '../plans/cleanup';
import {settleDueExecutionAdvisories,runExecutionCleanupTick} from '../execution/maintenance';
import {processExecutionNativeRetirement} from '../execution/native-retirement';
import {runSupportCleanupTick,expireSupportReceipts,settleDueSupportAdvice,runSupportAdviceCleanupTick,minimizeSupportAudit} from '../support/maintenance';
import {processSupportNativeRetirement} from '../support/native-retirement';
import {runExpansionCleanupTick,expireExpansionReceipts,settleDueExpansionAdvice,runExpansionAdviceCleanupTick,minimizeExpansionAdviceMetadata} from '../expansion/maintenance';
import {processExpansionNativeRetirement} from '../expansion/native-retirement';
import {reportTransaction} from '../reports/commands';
import {cleanupReportRevisionPayloads,cleanupReportFiles,cleanupStagedReportObjects,cleanupReportScratch,cleanupReportReceiptAudit,cleanupReportDeliveryAudit,cleanupReportDecisionAudit,cleanupUnmatchedReportEvents,cleanupReportRevisionAudit,cleanupExpiredReportPreviews} from '../reports/cleanup';
import {tickGapWorker} from '../gaps/worker';
import {runPartnerMaintenanceTick} from '../partners/maintenance';
import {runLearningMaintenanceTick} from '../learning/maintenance';
import {runMcpMaintenanceTick} from '../mcp/retention';

/** Due work only, oldest first before the cap. Operational records contain
 * timestamps and counters, never source payloads or customer labels. */
const backlogSql:Record<string,string>={
 conversation:"SELECT greatest(j.deadline_at,j.next_attempt_at,coalesce(j.lease_expires_at,j.deadline_at)) AS due_at FROM watchdog_jobs j JOIN response_attempts a ON a.id=j.attempt_id JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 AND j.state IN ('pending','leased','cancel_requested')",
 artifacts:"SELECT greatest(next_attempt_at,coalesce(lease_expires_at,next_attempt_at)) AS due_at FROM artifact_cleanup_jobs WHERE environment_id=$1 AND state<>'done' UNION ALL SELECT CASE WHEN state='leased' THEN least(lease_expires_at,deadline_at) ELSE next_attempt_at END FROM artifact_extraction_runs WHERE environment_id=$1 AND state IN ('queued','leased') UNION ALL SELECT next_attempt_at FROM ordinary_native_retirements WHERE environment_id=$1 AND state='requested' UNION ALL SELECT CASE WHEN u.state IN('purged','expired','cancelled') THEN u.created_at ELSE u.expires_at END FROM ordinary_native_uploads u WHERE u.environment_id=$1 AND (u.state IN('uploading','ready') OR u.state IN('purged','expired','cancelled') AND EXISTS(SELECT 1 FROM ordinary_native_upload_chunks chunks WHERE chunks.upload_id=u.id))",
 workforce:"SELECT greatest(not_before,coalesce(lease_expires_at,not_before)) AS due_at FROM workforce_cleanup_jobs WHERE environment_id=$1 AND state<>'completed' UNION ALL SELECT CASE WHEN state='running' THEN least(lease_expires_at,deadline_at) ELSE created_at END FROM workforce_import_jobs WHERE environment_id=$1 AND state IN ('queued','running')",
 retrieval:`SELECT CASE WHEN j.state='leased' THEN j.lease_until ELSE j.created_at END AS due_at
  FROM retrieval_jobs j WHERE j.environment_id=$1 AND j.kind IN ('invalidate','cleanup')
    AND j.state IN ('queued','leased','failed','unconfirmed')
  AND NOT (j.state='failed' AND EXISTS (
    SELECT 1 FROM retrieval_sources s WHERE s.id=j.source_id AND s.environment_id=j.environment_id
      AND s.lifecycle_state IN ('retired','tombstoned')
      AND NOT EXISTS (SELECT 1 FROM retrieval_passages p WHERE p.source_id=s.id)
      AND NOT EXISTS (SELECT 1 FROM retrieval_embedding_operations o JOIN retrieval_jobs related ON related.id=o.job_id
        WHERE related.source_id=s.id AND o.state IN ('reserved','dispatched','unconfirmed'))))`,
 // This lane schedules review notices; it does not perform the operator's external recheck.
 'research-freshness':`SELECT coalesce(due.updated_at+interval '1 hour',v.created_at) AS due_at
  ${researchReviewMarkingFromSql}
    AND EXISTS(SELECT 1 FROM turas_environment marker WHERE marker.environment_id=$1 AND marker.schema_version>=26)`,
 knowledge:"SELECT coalesce(last_maintenance_checked_at+interval '1 minute',published_at) AS due_at FROM knowledge_publications WHERE environment_id=$1 AND state='published'",
 plans:"SELECT created_at AS due_at FROM plan_cleanup_jobs WHERE environment_id=$1 AND state<>'completed'",
 execution:"SELECT greatest(due_at,coalesce(lease_until,due_at)) AS due_at FROM execution_cleanup_jobs WHERE environment_id=$1 AND state IN ('pending','leased')",
 support:"SELECT greatest(j.due_at,coalesce(j.lease_until,j.due_at)) AS due_at FROM support_cleanup_jobs j LEFT JOIN support_revisions r ON r.id=j.revision_id LEFT JOIN support_review_decisions d ON d.id=j.decision_id LEFT JOIN support_revisions dr ON dr.id=d.revision_id JOIN support_records s ON s.id=COALESCE(r.record_id,dr.record_id) WHERE s.environment_id=$1 AND j.state<>'done'",
 expansion:"SELECT greatest(j.deadline,coalesce(j.lease_until,j.deadline)) AS due_at FROM expansion_cleanup_jobs j JOIN expansion_payloads p ON p.id=j.payload_id LEFT JOIN expansion_revisions r ON r.id=p.revision_id LEFT JOIN expansion_decisions d ON d.id=p.decision_id LEFT JOIN expansion_hypotheses h ON h.id=COALESCE(r.record_id,d.record_id) LEFT JOIN expansion_owner_events e ON e.id=p.owner_event_id LEFT JOIN expansion_account_owners o ON o.customer_id=e.customer_id WHERE COALESCE(h.environment_id,o.environment_id)=$1 AND j.state<>'completed'",
 reports:"SELECT greatest(due_at,coalesce(lease_until,due_at)) AS due_at FROM report_cleanup_jobs WHERE environment_id=$1 AND state IN ('queued','leased') UNION ALL SELECT CASE WHEN state='leased' THEN least(lease_until,deadline_at) ELSE available_at END FROM report_jobs WHERE environment_id=$1 AND kind='render' AND state IN ('queued','leased')",
 gaps:"SELECT CASE WHEN state='running' THEN least(lease_until,deadline_at) ELSE created_at END AS due_at FROM gap_report_jobs WHERE environment_id=$1 AND state IN ('queued','running') UNION ALL SELECT greatest(coalesce(purge_at,created_at),coalesce(lease_until,purge_at,created_at)) FROM gap_report_store_objects WHERE environment_id=$1 AND state IN ('purge','quarantined')",
 partners:"SELECT greatest(purge_at,next_attempt_at) AS due_at FROM partner_cleanup_jobs WHERE environment_id=$1 AND completed_at IS NULL",
 learning:"SELECT greatest(due_at,next_attempt_at) AS due_at FROM learning_cleanup_jobs WHERE environment_id=$1 AND state<>'completed'",
 mcp:"SELECT expires_at AS due_at FROM mcp_handles WHERE environment_id=$1 UNION ALL SELECT expires_at FROM mcp_read_leases WHERE environment_id=$1",
};
export async function maintenanceBacklog(id:string){
 const sql=backlogSql[id];if(!sql)throw Error('Unknown maintenance class');
 const row=(await query(`SELECT count(*)::int AS n,min(due_at) AS oldest_due_at FROM (SELECT due_at FROM (${sql}) work WHERE due_at<=clock_timestamp() ORDER BY due_at LIMIT 1001) pending`,[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 const count=Number(row.n);
 return {backlog:Math.min(count,1000),truncated:count>1000,oldestDueAt:row.oldest_due_at as Date|null};
}

/** Shared cleanup authority never starts research, model drafting, embedding or
 * email delivery. Existing separately admitted heavy lanes remain independent. */
export function createMaintenanceBindings(options:{attachSession?:AttachSessionFn;cancelDue?:(attemptId:string)=>Promise<'settled'|'cancel_requested'|'retry'>}={}):MaintenanceBinding[]{
 const workerId=randomUUID();
 const steps:Record<string,((input:Parameters<MaintenanceTick>[0])=>Promise<unknown>)[]>={
  conversation:[async({limit,signal})=>{for(const job of await claimDueJobs(workerId,Math.min(1,limit))){signal.throwIfAborted();try{const result=options.cancelDue?await options.cancelDue(job.attemptId):options.attachSession?await performMaintenance({action:'cancel_due',attemptId:job.attemptId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID},options.attachSession):(()=>{throw Error('Cancellation transport unavailable');})();await finishDueJob(workerId,job.attemptId,result);}catch{await finishDueJob(workerId,job.attemptId,'retry','maintenance_call_failed');throw Error('Conversation cancellation unavailable');}}await heartbeatWorker(workerId);} ],
  artifacts:[()=>processOrdinaryNativeRetirement(),()=>cleanupNativeUploads(),input=>runLocalReconciliation(input),async()=>{const job=await claimArtifactCleanup();if(job)await runArtifactCleanup(job);},()=>reconcileExpiredArtifactIntents(),()=>reconcileArtifactOrphans(),()=>processNativeRetirement()],
  workforce:[()=>expireStaffingReservations(),()=>runWorkforceCleanupTick(),()=>settleDueStaffingAdvisories()],
  retrieval:[()=>runRetrievalLifecycleTick(),()=>runRetrievalCleanupTick()],
  'research-freshness':[()=>markDueResearch()],knowledge:[()=>suspendStaleKnowledge()],plans:[()=>runPlanCleanupTick()],
  execution:[()=>settleDueExecutionAdvisories(),()=>runExecutionCleanupTick(),()=>processExecutionNativeRetirement()],
  support:[()=>runSupportCleanupTick(),()=>expireSupportReceipts(),()=>minimizeSupportAudit(),()=>settleDueSupportAdvice(),()=>runSupportAdviceCleanupTick(),()=>processSupportNativeRetirement()],
  expansion:[()=>runExpansionCleanupTick(),()=>expireExpansionReceipts(),()=>settleDueExpansionAdvice(),()=>runExpansionAdviceCleanupTick(),()=>processExpansionNativeRetirement(),()=>minimizeExpansionAdviceMetadata()],
  reports:[cleanupReportRevisionPayloads,cleanupReportFiles,cleanupStagedReportObjects,cleanupReportScratch,cleanupReportReceiptAudit,cleanupReportDeliveryAudit,cleanupReportDecisionAudit,cleanupUnmatchedReportEvents,cleanupReportRevisionAudit,cleanupExpiredReportPreviews].map(cleanup=>({limit}:Parameters<MaintenanceTick>[0])=>reportTransaction(async db=>{await cleanup(db,Math.min(100,limit));})),
  gaps:[()=>tickGapWorker({prepare:false})],partners:[({limit})=>runPartnerMaintenanceTick(Math.min(100,limit))],learning:[()=>runLearningMaintenanceTick({attachSession:options.attachSession})],mcp:[()=>runMcpMaintenanceTick()],
 };
 return maintenanceClasses.map(definition=>({id:definition.id,enabled:true,optional:false,intervalMs:definition.intervalMs,tick:async input=>{
  input.signal.throwIfAborted();
  const marker=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID||Number(marker[0].schema_version)!==80)throw Error('Exact maintenance schema required');
  const operations=steps[definition.id];if(!operations)throw Error('Missing required maintenance binding');
  for(const operation of operations){input.signal.throwIfAborted();await operation(input);}
  input.signal.throwIfAborted();return maintenanceBacklog(definition.id);
 }}));
}
