import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {verifyReportSources,type ReportSource} from './sources';
import {reportDigest} from './commands';
import {requireCurrentReportBrand} from './brand';
import {currentReportEligibleInputDigest} from './freshness';
/** Metadata is safe to select first; protected payloads are read only after this fence. */
export async function reportRevisionFence(db:PoolClient,workspaceId:string,revisionId:string,options:{send?:boolean;published?:boolean}={}){
 const row=(await db.query(`SELECT v.*,s.kind,s.audience,s.timezone,s.engagement_ids,s.workload_ids,s.include_customer_level,s.version AS report_version,s.from_date::text,s.to_date::text,st.state,st.visibility,st.generation,st.reason_code,st.payload_expires_at AS expires_at,p.revision_id IS NOT NULL AS payload_present
 FROM report_revisions v JOIN report_scopes s ON s.id=v.report_id JOIN report_revision_states st ON st.revision_id=v.id
 LEFT JOIN report_revision_payloads p ON p.revision_id=v.id WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 `,[revisionId,process.env.TURAS_ENVIRONMENT_ID,workspaceId])).rows[0];
 if(!row)throw hiddenRecord();
 if(!row.payload_present || ['withheld','expired'].includes(row.visibility) || !row.expires_at || new Date(row.expires_at).getTime()<=Date.now())throw new HttpFailure(409,'source_changed','Report content is withheld');
 const sources:ReportSource[]=(await db.query('SELECT * FROM report_dependencies WHERE revision_id=$1 ORDER BY source_kind,source_revision_id',[revisionId])).rows.map(ref=>({kind:ref.source_kind,id:ref.source_id,revisionId:ref.source_revision_id,generation:Number(ref.generation),contentDigest:ref.content_digest,engagementId:ref.engagement_id,decisionId:ref.decision_id}));
 const ordered=[...sources].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
 const storedOrderedDigest=reportDigest(ordered),original=(await db.query('SELECT source_set_digest FROM report_revisions WHERE id=$1',[revisionId])).rows[0].source_set_digest;
 // Capture order is canonicalized at creation. Never accept edited dependency rows.
 if(storedOrderedDigest!==original)throw new HttpFailure(409,'source_changed','Report source manifest changed');
 await verifyReportSources(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId,customerId:row.customer_id,audience:row.audience},sources);
 const fenced=(await db.query(`SELECT st.visibility,st.generation,st.payload_expires_at AS expires_at FROM report_scopes s JOIN report_revision_states st ON st.revision_id=$1 JOIN report_revision_payloads p ON p.revision_id=st.revision_id WHERE s.id=$2 FOR SHARE OF s,st`,[revisionId,row.report_id])).rows[0];
 if(!fenced || fenced.generation!==row.generation || ['withheld','expired'].includes(fenced.visibility) || new Date(fenced.expires_at).getTime()<=Date.now())throw new HttpFailure(409,'source_changed','Report visibility changed');
 await requireCurrentReportBrand(db,workspaceId,row.brand_id,options.published??row.state==='published');
 let reviewRequired=row.visibility==='review_required';
 const watch=row.generation_watches.find((watch:any)=>watch.kind==='eligible_inputs');
 if(!watch)reviewRequired=true;
 else if(await currentReportEligibleInputDigest(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId,customerId:row.customer_id,audience:row.audience},
  {engagementIds:row.engagement_ids,workloadIds:row.workload_ids,includeCustomerLevel:row.include_customer_level,timezone:row.timezone},{fromDate:row.from_date,toDate:row.to_date})!==watch.digest)reviewRequired=true;
 if(options.send && reviewRequired)throw new HttpFailure(409,'source_changed','New delivery inputs require a fresh report review');
 return {...row,reviewRequired,sources};
}
