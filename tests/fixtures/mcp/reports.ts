import type {ReportSource} from '../../../lib/server/reports/sources';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../../../lib/server/auth/sessions';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { registerReportBrand } from '../../../lib/server/reports/brand';
import { currentReportEligibleInputDigest } from '../../../lib/server/reports/freshness';
import { reportDigest } from '../../../lib/server/reports/commands';
import { WEEKLY_SECTIONS } from '../../../lib/reports/document';
/** Owned synthetic read-state fixture. It tests publication selection/fences,
 * not the rendering, human approval or publication workflow. No business facts. */
export async function mcpPublishedReport(db:PoolClient,author:CurrentSession,customerId:string,published=true,options:{audience?:'delivery'|'account_team'|'leadership';large?:boolean;correctionOf?:string;sources?:ReportSource[]}={}){
 requireOwnedMcpDatabase(process.env,true);const audience=options.audience??'delivery',sources=[...(options.sources??[])].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
 const reportId=randomUUID(),revisionId=randomUUID(),publicationId=randomUUID(),decisionId=randomUUID(),environmentId=process.env.TURAS_ENVIRONMENT_ID!;
 const brandId=await registerReportBrand(db,author.workspaceId);
 await db.query("UPDATE report_brand_profiles SET state='approved' WHERE id=$1",[brandId]);
 const selection={engagementIds:[randomUUID()],workloadIds:[],includeCustomerLevel:true,timezone:'UTC'},period={fromDate:'2026-09-21',toDate:'2026-09-27'};
 const inputDigest=await currentReportEligibleInputDigest(db,{environmentId,workspaceId:author.workspaceId,customerId,audience},selection,period);
 const document={schemaVersion:'reports-v1',projectionVersion:'report-projection-v1',formulaVersion:'report-metrics-v1',templateVersion:'weekly-status-v1',kind:'weekly',
   title:'Synthetic published delivery notes',audience,classification:'Synthetic Delivery Report',timezone:'UTC',period,asOf:new Date().toISOString(),partial:false,
   ownerLabel:'Synthetic private owner',sponsorLabel:'Synthetic private sponsor',metrics:[],citations:[],gaps:[],annotations:[],correctionOf:options.correctionOf??null,
   sections:WEEKLY_SECTIONS.map(heading=>({heading,blocks:[{type:'note',text:options.large?'A'.repeat(12000):'Synthetic read-state note; no customer fact asserted.',citations:[]}]}))};
 const contentDigest=reportDigest(document);
 await db.query(`INSERT INTO report_scopes(id,environment_id,workspace_id,customer_id,kind,audience,timezone,from_date,to_date,engagement_ids,workload_ids,
   include_customer_level,scope_digest,owner_membership_id) VALUES($1,$2,$3,$4,'weekly','${audience}','UTC',$5,$6,$7,'{}',true,$8,$9)`,
   [reportId,environmentId,author.workspaceId,customerId,period.fromDate,period.toDate,selection.engagementIds,reportDigest(reportId),author.membershipId]);
 await db.query(`INSERT INTO report_revisions(id,environment_id,workspace_id,customer_id,report_id,revision_number,schema_version,template_version,projection_version,
   formula_version,as_of,partial,content_digest,source_set_digest,brand_id,brand_version,generation_watches,author_membership_id)
   VALUES($1,$2,$3,$4,$5,1,'reports-v1','weekly-status-v1','report-projection-v1','report-metrics-v1',$6,false,$7,$8,$9,1,$10,$11)`,
   [revisionId,environmentId,author.workspaceId,customerId,reportId,document.asOf,contentDigest,reportDigest(sources),brandId,JSON.stringify([{kind:'eligible_inputs',digest:inputDigest}]),author.membershipId]);
 for(const source of sources)await db.query(`INSERT INTO report_dependencies(id,environment_id,workspace_id,customer_id,revision_id,source_kind,source_id,source_revision_id,generation,content_digest,engagement_id,decision_id,eligibility_class)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'synthetic read state')`,[randomUUID(),environmentId,author.workspaceId,customerId,revisionId,source.kind,source.id,source.revisionId,source.generation,source.contentDigest,source.engagementId,source.decisionId]);
 await db.query('INSERT INTO report_revision_payloads(revision_id,document) VALUES($1,$2)',[revisionId,JSON.stringify(document)]);
 await db.query('INSERT INTO report_revision_states(revision_id,state) VALUES($1,$2)',[revisionId,published?'published':'draft']);
 await db.query('UPDATE report_scopes SET current_revision_id=$2 WHERE id=$1',[reportId,revisionId]);
 if(published){
  await db.query(`INSERT INTO report_decisions(id,environment_id,workspace_id,customer_id,actor_membership_id,action,subject_id,expected_version,preview_digest,rationale_digest,request_key)
    VALUES($1,$2,$3,$4,$5,'publish',$6,1,$7,$7,$8)`,[decisionId,environmentId,author.workspaceId,customerId,author.membershipId,reportId,reportDigest('synthetic fixture only'),randomUUID()]);
  await db.query(`INSERT INTO report_publications(id,environment_id,workspace_id,customer_id,report_id,revision_id,publication_number,decision_id,artifact_digests,mail_digest,audience,correction_of)
    VALUES($1,$2,$3,$4,$5,$6,1,$7,'{}',$8,'${audience}',$9)`,[publicationId,environmentId,author.workspaceId,customerId,reportId,revisionId,decisionId,contentDigest,options.correctionOf??null]);
 }
 return {reportId,revisionId,publicationId,document};
}
