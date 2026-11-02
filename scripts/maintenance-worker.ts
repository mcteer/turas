import {randomUUID} from 'node:crypto';
import {closeRuntimePool,withTransaction} from '../lib/server/db/client';
import {getServerConfig} from '../lib/server/config';
import {signMaintenanceRequest} from '../lib/server/conversations/watchdog';
import {createMaintenanceBindings} from '../lib/server/operations/maintenance-bindings';
import {startMaintenanceScheduler} from '../lib/server/operations/maintenance';
import {operationalCodeVersion} from '../lib/server/operations/code-version';
import {runHostedReconciliation} from '../lib/server/operations/hosted-reconciliation';
import {runRetrievalWorkerTick} from './retrieval-worker';
import {runWorkforceWorkerTick} from '../lib/server/staffing/runner';
import {heartbeatWorkforceWorker} from '../lib/server/staffing/worker-readiness';
import {requireStaffingEnvironment} from '../lib/server/staffing/repository';
import {observeMaintenanceHealth} from '../lib/server/operations/maintenance-health';

const rawOrigin=process.env.TURAS_EVE_INTERNAL_ORIGIN;if(!rawOrigin)throw Error('Local eve service origin required');
const origin=new URL(rawOrigin);
if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.username||origin.password||origin.pathname!=='/')throw Error('Maintenance worker requires a loopback eve origin');
const path='/internal/turas/maintenance';let stopping=false;
async function send(attemptId:string):Promise<'settled'|'cancel_requested'|'retry'>{
 const body=JSON.stringify({action:'cancel_due',attemptId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID}),timestamp=String(Date.now()),nonce=randomUUID();
 const response=await fetch(new URL(path,origin),{method:'POST',headers:{'content-type':'application/json','x-turas-timestamp':timestamp,'x-turas-nonce':nonce,'x-turas-signature':signMaintenanceRequest('POST',path,timestamp,nonce,body)},body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Maintenance transport unavailable');const parsed=await response.json() as {data?:{status?:string}};
 if(!['settled','cancel_requested','retry'].includes(parsed.data?.status??''))throw Error('Invalid maintenance response');return parsed.data!.status as 'settled'|'cancel_requested'|'retry';
}
async function sendSpecialist(discussionId:string,attemptId:string):Promise<'settled'|'cancel_requested'|'retry'>{
 const body=JSON.stringify({action:'cancel_specialist',discussionId,attemptId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID}),timestamp=String(Date.now()),nonce=randomUUID();
 const response=await fetch(new URL(path,origin),{method:'POST',headers:{'content-type':'application/json','x-turas-timestamp':timestamp,'x-turas-nonce':nonce,'x-turas-signature':signMaintenanceRequest('POST',path,timestamp,nonce,body)},body,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Specialist control transport unavailable');
 const status=(await response.json()).data?.status;
 if(!['settled','cancel_requested','retry'].includes(status))throw Error('Invalid specialist control response');return status;
}
const scheduler=startMaintenanceScheduler(getServerConfig().TURAS_ENVIRONMENT_ID,operationalCodeVersion(),createMaintenanceBindings({cancelDue:send,cancelSpecialist:sendSpecialist}));
// Already admitted embedding/import work keeps its separate heavy lane. It cannot
// block registry cleanup, cancellation or availability heartbeats.
const pending=new Map<string,Promise<unknown>>(),timers:ReturnType<typeof setInterval>[]=[];
function lane(id:string,interval:number,run:()=>Promise<unknown>){const tick=()=>{if(stopping||pending.has(id))return;const task=run().catch(()=>{console.warn(JSON.stringify({kind:'turas_worker_lane_failed',lane:id}));}).finally(()=>pending.delete(id));pending.set(id,task);};timers.push(setInterval(tick,interval));tick();}
lane('retrieval-index',2000,()=>runRetrievalWorkerTick());
lane('workforce-import',2000,async()=>{if(process.env.TURAS_WORKFORCE_STORE_ROOT)await runWorkforceWorkerTick();});
lane('workforce-readiness',5000,async()=>{if(process.env.TURAS_WORKFORCE_STORE_ROOT){await withTransaction(db=>requireStaffingEnvironment(db,false));await heartbeatWorkforceWorker();}});
lane('hosted-orphans',30000,()=>runHostedReconciliation({limit:20,signal:AbortSignal.timeout(30000)}));
lane('maintenance-health',60000,async()=>{const status=await observeMaintenanceHealth();if(!status.healthy)console.warn(JSON.stringify({kind:'turas_maintenance_unhealthy',classes:status.classes.filter(row=>row.state!=='healthy').map(row=>({classId:row.classId,state:row.state}))}));});
async function stop(){if(stopping)return;stopping=true;for(const timer of timers)clearInterval(timer);const timeout=setTimeout(()=>process.exit(1),35000);timeout.unref();await Promise.allSettled([scheduler.stop(),...pending.values()]);await closeRuntimePool();clearTimeout(timeout);}
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void stop();});
