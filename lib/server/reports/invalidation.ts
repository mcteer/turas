import type {PoolClient} from 'pg';
import {queueReportRevisionCleanup} from './cleanup';
import {currentReportEligibleInputDigest} from './freshness';
import {HttpFailure} from '../../contracts/http';

async function reportsInstalled(db:PoolClient){
 return Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID])).rows[0]?.schema_version??0)>=41;
}

/** Runs in the original source transaction, including when new reporting is disabled. */
export async function invalidateReportSource(db:PoolClient,kind:string,revisionId:string){
 if(!await reportsInstalled(db))return 0;
 const normalized=kind==='published_shared'?'shared_knowledge':kind==='execution_time'?'approved_time':kind;
 const affected=(await db.query(`UPDATE report_revision_states s SET visibility='withheld',
  generation=generation+1,reason_code='source_changed',updated_at=now()
  FROM report_revisions r WHERE r.id=s.revision_id AND r.environment_id=$1
  AND s.visibility NOT IN ('withheld','expired') AND EXISTS(SELECT 1 FROM report_dependencies d
   WHERE d.revision_id=r.id AND (d.source_kind=$2 OR ($2='accepted_profile' AND d.source_kind='workload_identity'))
   AND d.source_revision_id=$3) RETURNING s.revision_id`,[process.env.TURAS_ENVIRONMENT_ID,normalized,revisionId])).rows;
 for(const row of affected){
  await queueReportRevisionCleanup(db,row.revision_id);
  await db.query(`UPDATE report_deliveries d SET state='blocked',failure_code='source_changed',
   next_attempt_at=NULL,version=version+1 FROM report_publications p WHERE p.id=d.publication_id
   AND p.revision_id=$1 AND d.first_dispatch_at IS NULL AND d.state IN ('authorized','queued','retryable_failure')`,[row.revision_id]);
 }
 return affected.length;
}

/** Compare visible eligible inputs, not raw generations or hidden/pending record counts. */
export async function refreshReportScopeWatches(db:PoolClient,workspaceId:string,customerId:string,engagementId?:string){
 if(!await reportsInstalled(db))return 0;
 const rows=(await db.query(`SELECT r.id,r.generation_watches,s.* FROM report_revisions r
  JOIN report_scopes s ON s.current_revision_id=r.id JOIN report_revision_states st ON st.revision_id=r.id
  WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.customer_id=$3
  AND ($4::uuid IS NULL OR $4=ANY(s.engagement_ids)) AND st.visibility='current'
  ORDER BY s.id`,[process.env.TURAS_ENVIRONMENT_ID,workspaceId,customerId,engagementId??null])).rows;
 let changed=0;
 for(const row of rows){
  const revisionId=row.current_revision_id,watch=row.generation_watches.find((value:{kind:string;digest:string})=>value.kind==='eligible_inputs');
  if(!watch)continue;
   let current:string|undefined;
   try{current=await currentReportEligibleInputDigest(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId,customerId,audience:row.audience},
   {engagementIds:row.engagement_ids,workloadIds:row.workload_ids,includeCustomerLevel:row.include_customer_level,timezone:row.timezone},
    {fromDate:typeof row.from_date==='string'?row.from_date:row.from_date.toISOString().slice(0,10),toDate:typeof row.to_date==='string'?row.to_date:row.to_date.toISOString().slice(0,10)});
   }catch(error){
    // A now-oversized report must require a narrower fresh review, not prevent
    // the original domain from accepting a legitimate new source.
    if(!(error instanceof HttpFailure)||error.code!=='scope_too_large')throw error;
   }
  if(current!==watch.digest){
   await db.query("UPDATE report_revision_states SET visibility='review_required',generation=generation+1,reason_code='new_eligible_inputs',updated_at=now() WHERE revision_id=$1 AND visibility='current'",[revisionId]);changed++;
  }
 }
 return changed;
}
