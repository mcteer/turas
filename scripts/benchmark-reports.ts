import {performance} from 'node:perf_hooks';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {withReportsTestEnvironment} from './reports-test-environment';
import {reportsSourceDigest} from './reports-source';
import {seedReportLoad,reportLoadShape,fillReportDeliveryQueue,seedReportRecordOverflow} from '../tests/fixtures/reports/load';
import {listCustomerReports,readReport} from '../lib/server/reports/read';
import {readReportHistory,readReportSourceLabels} from '../lib/server/reports/history';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Temporal} from '@js-temporal/polyfill';
import {requireOwnedReportsDatabase} from '../tests/fixtures/reports/environment';
import {reportTransaction} from '../lib/server/reports/commands';
import {submitReportCustomerCommand,submitReportRevisionCommand,previewReportPublication,submitReportPublicationDecision,previewReportSend,submitReportSendDecision,readReportCommandReceipt} from '../lib/server/reports/service';
import {claimReportJobs,enqueueReportJob} from '../lib/server/reports/jobs';
import {runReportRenderJob} from '../lib/server/reports/render-jobs';
import {readReportObject} from '../lib/server/reports/store';
import {previewReportBrand,submitReportBrandDecision} from '../lib/server/reports/brand-review';
import {verifyConfiguredReportSender,registerVerifiedReportSender} from '../lib/server/reports/senders';
import {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy} from '../lib/server/reports/recipient-policy';
import {listReportPolicies,listReportDeliveries} from '../lib/server/reports/management';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {requireReportQueueCapacity} from '../lib/server/reports/rates';
import {captureReportSnapshot} from '../lib/server/reports/snapshots';
import {lockReportActor} from '../lib/server/reports/policy';
let evidenceDirectory:string|undefined;

async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--disposable')throw new Error('Benchmark requires --disposable with no overrides');
 const sourceDigest=await reportsSourceDigest();await mkdir('local-artifacts/009',{recursive:true,mode:0o700});
 const directory=await mkdtemp(resolve('local-artifacts/009/load-'));
 evidenceDirectory=directory;
  await withReportsLocalEnvironment(()=>withReportsTestEnvironment(async()=>{
  const image=execFileSync('docker',['image','inspect','turas-report-renderer:009-executive-v1','--format','{{.Id}}'],{encoding:'utf8'}).trim();
  process.env.TURAS_REPORT_RENDERER_IMAGE=image;
  const seeded=await seedReportLoad(),measurements:Record<string,{samples:number;p95Ms:number;maxMs:number}>={};
  const operations={
   list:async(index:number)=>{const result=await listCustomerReports(seeded.users[index%5],seeded.customerId,{});if(result.reports.length!==1||result.reports[0].reportId!==seeded.report.reportId)throw new Error('Load list correctness differs');return result;},
   detail:async(index:number)=>{const result=await readReport(seeded.users[index%5],seeded.report.reportId);if(!result.document||result.visibility!=='current')throw new Error('Load detail unavailable');const actual=result.document.metrics.find(metric=>metric.label.endsWith('Period Actual'));if(actual?.value!==(seeded.expectedApprovedMinutes/60).toFixed(2))throw new Error('Independent approved-minute sentinel differs');if(JSON.stringify(result).includes('PRIVATE_BENCHMARK_TIME_NOTE'))throw new Error('Load privacy sentinel leaked');return result;},
   history:async(index:number)=>{const result=await readReportHistory(seeded.users[index%5],seeded.report.reportId,{limit:20});if(result.revisions.length!==20||!result.cursor)throw new Error('Load history bound differs');return result;},
   sources:async(index:number)=>{const result=await readReportSourceLabels(seeded.users[index%5],seeded.report.reportId);if(result.revisionId!==seeded.report.revisionId||!result.sources.length)throw new Error('Load source correctness differs');return result;},
  };
  for(const [name,operation]of Object.entries(operations)){
   for(let index=0;index<reportLoadShape.warmups;index++)await operation(index);
   const times:number[]=[];
   for(let index=0;index<reportLoadShape.samples;index+=reportLoadShape.clients)await Promise.all(Array.from({length:reportLoadShape.clients},async(_,offset)=>{const started=performance.now();await operation(index+offset);times.push(performance.now()-started);}));
   times.sort((a,b)=>a-b);const p95Ms=times[Math.ceil(times.length*0.95)-1];measurements[name]={samples:times.length,p95Ms,maxMs:times.at(-1)!};
   await writeFile(join(directory,'measurements.json'),JSON.stringify({sourceDigest,shape:reportLoadShape,measurements}),{mode:0o600});
   if(p95Ms>2000)throw new Error(`Load ${name} p95 exceeds 2 seconds`);
  }
  await requireOwnedReportsDatabase();
  // Fixture construction consumed one draft. Start the measured workload with
  // an empty quota in this owned database only; production limits remain active.
  await reportTransaction(db=>db.query('DELETE FROM report_rate_windows WHERE environment_id=$1 AND workspace_id=$2 AND bucket=$3',[process.env.TURAS_ENVIRONMENT_ID,seeded.reviewer.workspaceId,'draft-generation']));
  const preparations:Array<{durationMs:number;reportId:string}>=[];
  for(let index=0;index<20;index+=2)await Promise.all([index,index+1].map(async slot=>{
   const started=performance.now();
   const report=await submitReportCustomerCommand(seeded.users[slot%5],seeded.customerId,{...seeded.command,requestKey:randomUUID(),selection:{...seeded.command.selection,engagementIds:[seeded.engagements[slot+1].engagementId]}}) as Awaited<ReturnType<typeof readReport>>;
   if(!report.document||report.visibility!=='current')throw new Error('Load preparation did not release the prepared document');
   if(report.document.metrics.find(metric=>metric.label.endsWith('Period Actual'))?.value!==(seeded.expectedApprovedMinutes/60).toFixed(2))throw new Error('Prepared report independent effort sentinel differs');
   if(JSON.stringify(report).includes('PRIVATE_BENCHMARK_TIME_NOTE'))throw new Error('Prepared report privacy sentinel leaked');
   const durationMs=performance.now()-started;preparations.push({durationMs,reportId:report.reportId});
   if(durationMs>30000)throw new Error('Weekly preparation exceeded 30 seconds');
  }));
  if(preparations.length!==20||new Set(preparations.map(row=>row.reportId)).size!==20)throw new Error('Preparation workload omitted or duplicated a report');
  let quotaDenied=false;
  try{await submitReportCustomerCommand(seeded.users[2],seeded.customerId,{...seeded.command,requestKey:randomUUID(),selection:{...seeded.command.selection,engagementIds:[seeded.engagements[21].engagementId]}});}
  catch(error){if((error as {code?:string;status?:number}).code!=='rate_limited'||(error as {status?:number}).status!==429)throw error;quotaDenied=true;}
  if(!quotaDenied)throw new Error('Production draft quota did not reject preparation 21');
  await requireOwnedReportsDatabase();
  // Executive timing is a separate workload phase with its own setup quota.
  await reportTransaction(db=>db.query('DELETE FROM report_rate_windows WHERE environment_id=$1 AND workspace_id=$2 AND bucket=$3',[process.env.TURAS_ENVIRONMENT_ID,seeded.reviewer.workspaceId,'draft-generation']));
  await reportTransaction(db=>db.query('DELETE FROM report_rate_windows WHERE environment_id=$1 AND workspace_id=$2 AND bucket=ANY($3::text[])',[process.env.TURAS_ENVIRONMENT_ID,seeded.reviewer.workspaceId,seeded.users.map(user=>`generation:${user.membershipId}`)]));
  const day=Temporal.PlainDate.from(seeded.period.from),fromDate=day.with({day:1}),toDate=fromDate.add({months:1}).subtract({days:1});
  const executive=new Map<string,{revisionId:string;queuedAt:number}>(),renders:Array<{durationMs:number;queueMs:number;revisionId:string}>=[];
  const executiveSamples:Array<{revisionId:string;kind:string}>=[];
  for(let slot=0;slot<12;slot++){
   const kind=slot%2?'quarterly':'monthly',quarter=day.with({month:Math.floor((day.month-1)/3)*3+1,day:1});
   const view=await submitReportCustomerCommand(seeded.users[slot%5],seeded.customerId,{...seeded.command,requestKey:randomUUID(),fromDate:kind==='monthly'?fromDate.toString():quarter.toString(),toDate:kind==='monthly'?toDate.toString():quarter.add({months:3}).subtract({days:1}).toString(),selection:{...seeded.command.selection,kind,engagementIds:[seeded.engagements[slot+22].engagementId]}}) as Awaited<ReturnType<typeof readReport>>;
   executiveSamples.push({revisionId:view.revisionId,kind});
   const queuedAt=performance.now();
   await submitReportRevisionCommand(seeded.users[(slot+2)%5],view.reportId,{action:'render',requestKey:randomUUID(),expectedVersion:view.version,rationale:'Measure real executive artifact pairs on the owned representative corpus'});
   const job=await reportTransaction(async db=>(await db.query("SELECT id FROM report_jobs WHERE revision_id=$1 AND kind='render' AND state='queued'",[view.revisionId])).rows[0]);
   if(!job)throw new Error('Executive preparation did not enqueue its exact render');
   executive.set(job.id,{revisionId:view.revisionId,queuedAt});
  }
  while(renders.length<12){
   const jobs=await reportTransaction(db=>claimReportJobs(db,'render',2));
   if(!jobs.length)throw new Error('Executive load jobs made no progress');
   await Promise.all(jobs.map(async job=>{
    const queued=executive.get(job.id);if(!queued)throw new Error('Unexpected executive load job');
    const started=performance.now();await runReportRenderJob(job);const durationMs=performance.now()-started;
    const files=await reportTransaction(async db=>(await db.query('SELECT a.format,a.object_key,a.content_digest,a.size_bytes,s.state FROM report_artifacts a JOIN report_revision_states s ON s.revision_id=a.revision_id WHERE a.revision_id=$1 AND a.validation_id IS NOT NULL',[queued.revisionId])).rows);
    if(files.length!==2||new Set(files.map(file=>file.format)).size!==2||files.some(file=>file.state!=='review_ready'))throw new Error('Executive load pair did not finalize exact validated files');
    for(const file of files)await readReportObject(file.object_key,file.content_digest,Number(file.size_bytes));
    renders.push({durationMs,queueMs:started-queued.queuedAt,revisionId:queued.revisionId});
    if(durationMs>120000)throw new Error('Executive pair exceeded 120 seconds');
   }));
  }
  if(new Set(renders.map(row=>row.revisionId)).size!==12)throw new Error('Executive workload duplicated or omitted a pair');
  const weekly=await readReport(seeded.reviewer,seeded.report.reportId);
  await submitReportRevisionCommand(seeded.users[4],weekly.reportId,{action:'render',requestKey:randomUUID(),expectedVersion:weekly.version,rationale:'Validate the synthetic weekly load sample before exact approval'});
  const brandId=await reportTransaction(async db=>(await db.query('SELECT brand_id FROM report_revisions WHERE id=$1',[weekly.revisionId])).rows[0].brand_id as string);
  const brandInput={customerId:seeded.customerId,action:'approve' as const,expectedVersion:1,sampleRevisionIds:[weekly.revisionId,executiveSamples.find(row=>row.kind==='monthly')!.revisionId,executiveSamples.find(row=>row.kind==='quarterly')!.revisionId]};
  const brandPreview=await previewReportBrand(seeded.reviewer,brandId,brandInput);
  await submitReportBrandDecision(seeded.reviewer,brandId,{...brandInput,previewId:brandPreview.previewId,previewDigest:brandPreview.previewDigest,requestKey:randomUUID(),rationale:'Approve actual synthetic samples for the owned load fixture only'});
  const publicationPreview=await previewReportPublication(seeded.reviewer,weekly.reportId,{action:'publish',expectedVersion:weekly.version});
  const publication=await submitReportPublicationDecision(seeded.reviewer,weekly.reportId,{action:'publish',expectedVersion:weekly.version,requestKey:randomUUID(),previewId:publicationPreview.previewId,previewDigest:publicationPreview.previewDigest,rationale:'Approve the exact synthetic weekly load fixture'}) as Awaited<ReturnType<typeof readReport>>;
  const sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:process.env.TURAS_REPORT_SENDER_DOMAIN_ID,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
  await reportTransaction(db=>registerVerifiedReportSender(db,seeded.reviewer.workspaceId,sender));
  const policy=await reportTransaction(db=>createReportRecipientPolicy(db,seeded.reviewer,seeded.customerId,{selection:seeded.command.selection,senderId:sender.id,recipients:[{address:'load-recipient@example.invalid',entitlementRationale:'Explicit synthetic owned load fixture entitlement'}]}));
  const policyPreview=await reportTransaction(db=>createReportPolicyPreview(db,seeded.reviewer,policy.policyId,'approve',1));
  await reportTransaction(db=>decideReportPolicy(db,seeded.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),previewId:policyPreview.previewId,previewDigest:policyPreview.previewDigest,rationale:'Approve exact synthetic load policy'}));
  const sendInput={action:'send' as const,policyId:policy.policyId,expectedVersion:publication.version,expectedPolicyVersion:2};
  const sendPreview=await previewReportSend(seeded.reviewer,publication.publicationId!,sendInput),acknowledgementKey=randomUUID();
  await submitReportSendDecision(seeded.reviewer,publication.publicationId!,{...sendInput,requestKey:acknowledgementKey,previewId:sendPreview.previewId,previewDigest:sendPreview.previewDigest,rationale:'Authorize synthetic intent only; no provider dispatch in the benchmark'});
  const restrictedReads={
   policies:async(index:number)=>{const actor=seeded.users[index%5],result=await listReportPolicies(actor,seeded.customerId,{});if(actor.membershipId===seeded.reviewer.membershipId){if(!result.canManage||result.policies.length!==1)throw new Error('Operator policy load projection differs');}else if(result.canManage||result.policies.length||JSON.stringify(result).includes('load-recipient@'))throw new Error('Policy load privacy sentinel leaked');},
   deliveries:async(index:number)=>{const actor=seeded.users[index%5],result=await listReportDeliveries(actor,weekly.reportId,{});if(actor.membershipId===seeded.reviewer.membershipId){if(!result.canManage||result.deliveries.length!==1||result.deliveries[0].state!=='queued')throw new Error('Operator delivery load projection differs');}else if(result.canManage||result.deliveries.length||JSON.stringify(result).includes('load-recipient@'))throw new Error('Delivery load privacy sentinel leaked');},
   acknowledgement:async()=>{const result=await readReportCommandReceipt(seeded.reviewer,acknowledgementKey) as Awaited<ReturnType<typeof readReport>>;if(result.reportId!==weekly.reportId||result.publicationId!==publication.publicationId)throw new Error('Exact review acknowledgement differs');},
  };
  for(const [name,operation]of Object.entries(restrictedReads)){
   for(let index=0;index<10;index++)await operation(index);
   const times:number[]=[];
   for(let index=0;index<100;index+=5)await Promise.all(Array.from({length:5},async(_,offset)=>{const started=performance.now();await operation(index+offset);times.push(performance.now()-started);}));
   times.sort((a,b)=>a-b);const p95Ms=times[94];measurements[name]={samples:times.length,p95Ms,maxMs:times.at(-1)!};
   await writeFile(join(directory,'measurements.json'),JSON.stringify({sourceDigest,shape:reportLoadShape,measurements}),{mode:0o600});
   if(p95Ms>2000)throw new Error(`Load ${name} p95 exceeds 2 seconds`);
  }
  const authority={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:seeded.reviewer.workspaceId,customerId:seeded.customerId,ownerMembershipId:seeded.reviewer.membershipId,ownerDecisionId:null,policyRevisionId:null};
  await reportTransaction(async db=>{for(let index=0;index<99;index++)await enqueueReportJob(db,authority,'draft',{syntheticLoad:randomUUID()});});
  await reportTransaction(db=>enqueueReportJob(db,{...authority,customerId:DEMO_IDS.deniedCustomer},'draft',{syntheticLoad:randomUUID()}));
  let queueDenied=false;
  try{await reportTransaction(db=>enqueueReportJob(db,authority,'draft',{syntheticLoad:randomUUID()}));}
  catch(error){if((error as {code?:string;status?:number}).code!=='rate_limited'||(error as {status?:number}).status!==429)throw error;queueDenied=true;}
  if(!queueDenied)throw new Error('Draft queue accepted job 101');
  const fairBatch=await reportTransaction(db=>claimReportJobs(db,'draft',2));
  if(fairBatch.length!==2||new Set(fairBatch.map(job=>job.customer_id)).size!==2)throw new Error('Backlogged customer starved the other customer');
  await fillReportDeliveryQueue();
  let deliveryQueueDenied=false;
  try{await reportTransaction(db=>requireReportQueueCapacity(db,seeded.reviewer.workspaceId,'delivery'));}
  catch(error){if((error as {code?:string;status?:number}).code!=='rate_limited'||(error as {status?:number}).status!==429)throw error;deliveryQueueDenied=true;}
  if(!deliveryQueueDenied)throw new Error('Delivery capacity did not reject intent 501');
  await seedReportRecordOverflow(seeded.engagements[0].engagementId);
  let overflowDenied=false;
  try{await reportTransaction(async db=>{
   await lockReportActor(db,seeded.reviewer,seeded.customerId,'prepare','delivery');
   await captureReportSnapshot(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:seeded.reviewer.workspaceId,customerId:seeded.customerId,audience:'delivery'},seeded.command.selection,seeded.command.fromDate,seeded.command.toDate,true);
  });}catch(error){if((error as {code?:string}).code!=='scope_too_large')throw error;overflowDenied=true;}
  if(!overflowDenied)throw new Error('Selected report silently truncated record overflow');
  if(sourceDigest!==await reportsSourceDigest())throw new Error('Benchmark source changed');
  const evidence={gate:'reports-load',sourceDigest,shape:reportLoadShape,measurements,operatorReadModel:'Five concurrent requests; policy/delivery projections cover one mcteer and four contributors; acknowledgements use current mcteer authority only',preparations:{count:preparations.length,concurrency:2,maxMs:Math.max(...preparations.map(row=>row.durationMs)),quotaDenied},renders:{count:renders.length,concurrency:2,maxMs:Math.max(...renders.map(row=>row.durationMs)),maxQueueMs:Math.max(...renders.map(row=>row.queueMs)),image,cpuPerJob:2,memoryGiBPerJob:2,network:'none'},queue:{limit:100,rejected101:queueDenied,fairCustomerCount:2,deliveryLimit:500,rejected501:deliveryQueueDenied},scopeOverflowDenied:overflowDenied,status:'passed',pending:[]};
  await writeFile(join(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
 }));
}
main().catch(async error=>{if(evidenceDirectory)await writeFile(join(evidenceDirectory,'failure.json'),JSON.stringify({message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined}),{mode:0o600,flag:'wx'});console.error('Report load reader layer failed; inspect private load evidence');process.exitCode=1;});
