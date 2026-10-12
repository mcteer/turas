import {randomUUID} from 'node:crypto';
import {closeRuntimePool} from '../lib/server/db/client';
import {reportTransaction} from '../lib/server/reports/commands';
import {reportConfig} from '../lib/server/reports/config';
import {requireReportEnvironment} from '../lib/server/reports/readiness';
import {claimReportJobs,failReportJob} from '../lib/server/reports/jobs';
import {runReportRenderJob} from '../lib/server/reports/render-jobs';
import {runReportDraftJob} from '../lib/server/reports/draft-jobs';
import {tickReportSchedules} from '../lib/server/reports/schedules';
import {claimReportDeliveries,dispatchReportDelivery} from '../lib/server/reports/outbox';

const workerId=randomUUID();let stopping=false,ready=false,refreshing=false,working=false;
async function refresh(){
 if(stopping||refreshing)return;refreshing=true;
 try{
  await reportTransaction(async db=>{await requireReportEnvironment(db);await db.query('INSERT INTO report_worker_heartbeats(environment_id,worker_id,seen_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET seen_at=EXCLUDED.seen_at',[process.env.TURAS_ENVIRONMENT_ID,workerId]);});ready=true;
  }catch(error){const code=String((error as {code?:unknown})?.code??'unknown');console.error(JSON.stringify({kind:'report_worker_failure',phase:'heartbeat',code:/^[a-zA-Z0-9_]{1,64}$/.test(code)?code:'unknown'}));ready=false;}finally{refreshing=false;}
}
async function work(){
  if(stopping||working||!ready)return;working=true;
  let phase='schedule_tick';
  try{
   if(!reportConfig().enabled)return;
   phase='schedule_tick';await reportTransaction(db=>tickReportSchedules(db));
  const drafts=await reportTransaction(db=>claimReportJobs(db,'draft',1));
  for(const draft of drafts){try{await runReportDraftJob(draft);}catch{await reportTransaction(db=>failReportJob(db,draft.id,draft.lease_token,'draft_failed'));}}
   phase='render_claim';const renders=await reportTransaction(db=>claimReportJobs(db,'render',2));
   const deliveries=reportConfig().deliveryEnabled?await reportTransaction(db=>claimReportDeliveries(db,2)):[];
  await Promise.allSettled([...renders.map(render=>runReportRenderJob(render).catch(async()=>{await reportTransaction(db=>failReportJob(db,render.id,render.lease_token,'render_failed'));})),...deliveries.map(delivery=>dispatchReportDelivery(delivery))]);
  }catch(error){
   const code=String((error as {code?:unknown})?.code??'unknown');
   console.error(JSON.stringify({kind:'report_worker_failure',phase,code:/^[a-zA-Z0-9_]{1,64}$/.test(code)?code:'unknown'}));
   ready=false;
  }finally{working=false;}
}
const heartbeat=setInterval(()=>{void refresh();},10000),tick=setInterval(()=>{void work();},2000);
void refresh();
async function stop(){
 if(stopping)return;stopping=true;clearInterval(heartbeat);clearInterval(tick);
 const shutdown=setTimeout(()=>process.exit(0),35000);shutdown.unref();
 while(working||refreshing)await new Promise(resolve=>setTimeout(resolve,100));
 await closeRuntimePool();clearTimeout(shutdown);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void stop();});
