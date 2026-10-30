import {planExecutiveSlides} from '../../../report-renderer/layout';
import {validateReportDocument} from '../../../lib/reports/document';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../../../lib/server/auth/sessions';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {mcpAcceptedPlan} from '../mcp/plans';
import {submitExecutionCommand} from '../../../lib/server/execution/service';
import {addReviewedReportActivity} from '../reports/delivery';
import {reportTransaction} from '../../../lib/server/reports/commands';
import {submitReportCustomerCommand,submitReportRevisionCommand,previewReportPublication,submitReportPublicationDecision} from '../../../lib/server/reports/service';
import {claimReportJobs} from '../../../lib/server/reports/jobs';
import {runReportRenderJob} from '../../../lib/server/reports/render-jobs';
import {previewReportBrand,submitReportBrandDecision} from '../../../lib/server/reports/brand-review';
import type {pilotLoadEvidenceFixture} from './load';
/** Actual proposal, execution review, branded render and publication. No direct
 * accepted states, report file metadata or publication approvals are inserted. */
export async function pilotLoadDeliveryBaseFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>,signal:AbortSignal){
 requireOwnedPilotDatabase(process.env,true);signal.throwIfAborted();
 const author=evidence.actors[1],reviewer=evidence.actors[0],customerId=evidence.customers[0].id;
 const plan=await mcpAcceptedPlan(author,reviewer,customerId);
 const {baselineId,engagementId}=plan.decision;if(!baselineId||!engagementId)throw Error('Normally accepted load baseline required');
 const fixture={author,reviewer,customerId,baselineId,engagementId,decision:plan.decision,created:plan.created,content:plan.content};
 await submitExecutionCommand(author,engagementId,{version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:1,plan:plan.decision.aggregateVersion},payload:{baselineId}});
 const activity=await addReviewedReportActivity(fixture,{eventDate:'2026-09-24',narrative:'Controlled synthetic load demonstration, not an actual customer outcome.'});
 return {plan,engagementId,baselineId,activity};
}
export async function pilotLoadDraftReportFixture(db:PoolClient,evidence:{actors:CurrentSession[];customers:{id:string}[]},delivery:Awaited<ReturnType<typeof pilotLoadDeliveryBaseFixture>>,signal:AbortSignal){
 requireOwnedPilotDatabase(process.env,true);const {plan,engagementId,baselineId,activity}=delivery,author=evidence.actors[1],reviewer=evidence.actors[0],customerId=evidence.customers[0].id;
 if(process.env.TURAS_REPORTS_ENABLED!=='true'||!/^sha256:[a-f0-9]{64}$/.test(process.env.TURAS_PILOT_RENDERER_IMAGE??''))throw Error('Explicit prepared owned renderer required');
 const reports:any[]=[];
 for(const period of [{kind:'weekly',fromDate:'2026-09-21',toDate:'2026-09-27'},{kind:'monthly',fromDate:'2026-09-01',toDate:'2026-09-30'},{kind:'quarterly',fromDate:'2026-07-01',toDate:'2026-09-30'}]){
  signal.throwIfAborted();const view=await submitReportCustomerCommand(author,customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:period.kind,audience:'delivery',timezone:'UTC',engagementIds:[engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:period.fromDate,toDate:period.toDate,partial:false}) as any;
  await submitReportRevisionCommand(reviewer,view.reportId,{action:'render',requestKey:randomUUID(),expectedVersion:view.version,rationale:'Validate controlled synthetic load output'});
  if(period.kind!=='weekly'){planExecutiveSlides(validateReportDocument((await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[view.revisionId])).rows[0].document));const [job]=await reportTransaction(db=>claimReportJobs(db,'render'));if(!job)throw Error('Actual load report render job unavailable');await runReportRenderJob(job);}
  reports.push(view);
 }
 const brand=(await db.query('SELECT b.id,b.state FROM report_brand_profiles b JOIN report_revisions r ON r.brand_id=b.id WHERE r.id=$1',[reports[0].revisionId])).rows[0];
 return {...delivery,reports,brandId:brand.id,brandState:brand.state};
}
export async function pilotLoadReportFixture(db:PoolClient,evidence:{actors:CurrentSession[];customers:{id:string}[]},delivery:Awaited<ReturnType<typeof pilotLoadDeliveryBaseFixture>>,signal:AbortSignal){
 const draft=await pilotLoadDraftReportFixture(db,evidence,delivery,signal),{reports}=draft,reviewer=evidence.actors[0],customerId=evidence.customers[0].id,brand={id:draft.brandId,state:draft.brandState};
 if(brand.state!=='approved'){const body={customerId,action:'approve' as const,expectedVersion:1,sampleRevisionIds:reports.map(report=>report.revisionId)},preview=await previewReportBrand(reviewer,brand.id,body);await submitReportBrandDecision(reviewer,brand.id,{...body,previewId:preview.previewId,previewDigest:preview.previewDigest,requestKey:randomUUID(),rationale:'Review actual controlled branded samples'});}
 const preview=await previewReportPublication(reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version});
 const published=await submitReportPublicationDecision(reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version,requestKey:randomUUID(),rationale:'Publish controlled synthetic load report',previewId:preview.previewId,previewDigest:preview.previewDigest});
 return {...delivery,published,reports,brandId:brand.id};
}
export async function pilotLoadDeliveryFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>,signal:AbortSignal){
 return pilotLoadReportFixture(db,evidence,await pilotLoadDeliveryBaseFixture(db,evidence,signal),signal);
}
