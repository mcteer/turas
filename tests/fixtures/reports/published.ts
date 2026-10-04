import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {reportsDeliveryFixture} from './delivery';
import {reportTransaction} from '../../../lib/server/reports/commands';
import {submitReportCustomerCommand,submitReportRevisionCommand,previewReportPublication,submitReportPublicationDecision} from '../../../lib/server/reports/service';
import {claimReportJobs} from '../../../lib/server/reports/jobs';
import {runReportRenderJob} from '../../../lib/server/reports/render-jobs';
import {previewReportBrand,submitReportBrandDecision} from '../../../lib/server/reports/brand-review';
/** Every approval uses actual renderer output and the normal exact-preview domain path. */
export async function publishedReportFixture(){
 const fixture=await reportsDeliveryFixture();
 process.env.TURAS_REPORTS_ENABLED='true';
 process.env.TURAS_REPORT_RENDERER_IMAGE=execFileSync('docker',['image','inspect','turas-report-renderer:009-executive-v1','--format','{{.Id}}'],{encoding:'utf8'}).trim();
 const reports:any[]=[];
 for(const period of [{kind:'weekly',fromDate:'2026-09-21',toDate:'2026-09-27'},{kind:'monthly',fromDate:'2026-09-01',toDate:'2026-09-30'},{kind:'quarterly',fromDate:'2026-07-01',toDate:'2026-09-30'}]){
  const view=await submitReportCustomerCommand(fixture.author,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:period.kind,audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:period.fromDate,toDate:period.toDate,partial:false}) as any;
  await submitReportRevisionCommand(fixture.reviewer,view.reportId,{action:'render',requestKey:randomUUID(),expectedVersion:view.version,rationale:'Validate actual synthetic sample'});
   if(period.kind!=='weekly'){
    if(process.env.TURAS_REPORT_UI_READY==='1'){
     const deadline=Date.now()+120000;let rendered=false;
     while(Date.now()<deadline){
      const state=await reportTransaction(async db=>(await db.query('SELECT state FROM report_revision_states WHERE revision_id=$1',[view.revisionId])).rows[0]?.state);
      if(state==='review_ready'){rendered=true;break;}
      if(state==='failed'||state==='cancelled')throw new Error('Owned report worker failed the actual sample render');
      await new Promise(done=>setTimeout(done,500));
     }
     if(!rendered)throw new Error('Owned report worker sample render deadline exceeded');
    }else{const [job]=await reportTransaction(db=>claimReportJobs(db,'render'));await runReportRenderJob(job);}
   }reports.push(view);
 }
  const brand=await reportTransaction(async db=>(await db.query('SELECT b.id,b.state FROM report_brand_profiles b JOIN report_revisions r ON r.brand_id=b.id WHERE r.id=$1',[reports[0].revisionId])).rows[0]);
  const brandId=brand.id;
 const body={customerId:fixture.customerId,action:'approve' as const,expectedVersion:1,sampleRevisionIds:reports.map(report=>report.revisionId)};
  // A second fixture may reuse the same already-reviewed immutable manifest.
  // New report outputs still render and validate above; never manufacture a new
  // approval or reset the approved brand to draft merely to repeat setup.
  if(brand.state!=='approved'){
   const preview=await previewReportBrand(fixture.reviewer,brandId,body);
   await submitReportBrandDecision(fixture.reviewer,brandId,{...body,previewId:preview.previewId,previewDigest:preview.previewDigest,requestKey:randomUUID(),rationale:'Approve actual synthetic branded outputs'});
  }
 const review=await previewReportPublication(fixture.reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version});
 const published=await submitReportPublicationDecision(fixture.reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version,requestKey:randomUUID(),rationale:'Publish exact synthetic weekly sample',previewId:review.previewId,previewDigest:review.previewDigest}) as any;
 return {...fixture,published,reports,brandId};
}
