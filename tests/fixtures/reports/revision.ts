import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {reportDigest} from '../../../lib/server/reports/commands';
/** Direct schema fixture contains no business facts or approval bypass outside owned tests. */
export async function insertReportRevisionFixture(db:PoolClient){
 const reportId=randomUUID(),revisionId=randomUUID(),brandId=randomUUID(),scopeDigest=reportDigest(reportId),digest=reportDigest({synthetic:true});
 const env=process.env.TURAS_ENVIRONMENT_ID;
 await db.query(`INSERT INTO report_brand_profiles(id,environment_id,workspace_id,version,manifest,manifest_digest,font_digest,template_digest) VALUES($1,$2,$3,1,'{}',$4,$4,$4)`,[brandId,env,DEMO_IDS.workspace,digest]);
 await db.query(`INSERT INTO report_scopes(id,environment_id,workspace_id,customer_id,kind,audience,timezone,from_date,to_date,engagement_ids,workload_ids,include_customer_level,scope_digest,owner_membership_id) VALUES($1,$2,$3,$4,'weekly','delivery','UTC','2026-09-21','2026-09-27',$5,'{}',true,$6,$7)`,[reportId,env,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,[randomUUID()],scopeDigest,DEMO_IDS.mcteerMembership]);
 await db.query(`INSERT INTO report_revisions(id,environment_id,workspace_id,customer_id,report_id,revision_number,schema_version,template_version,projection_version,formula_version,as_of,partial,content_digest,source_set_digest,brand_id,brand_version,generation_watches,author_membership_id) VALUES($1,$2,$3,$4,$5,1,'reports-v1','weekly-status-v1','report-projection-v1','report-metrics-v1',now(),false,$6,$6,$7,1,'{}',$8)`,[revisionId,env,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,reportId,digest,brandId,DEMO_IDS.mcteerMembership]);
 await db.query(`INSERT INTO report_revision_payloads(revision_id,document) VALUES($1,'{"synthetic":true}')`,[revisionId]);
 await db.query(`INSERT INTO report_revision_states(revision_id,state) VALUES($1,'draft')`,[revisionId]);
 return {reportId,revisionId,brandId,digest};
}
