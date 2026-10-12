import {afterEach,it,expect,vi} from 'vitest';
const calls=vi.hoisted(()=>({workforce:vi.fn(async()=>{}),cleanup:vi.fn(async()=>{}),heartbeat:vi.fn(async()=>{}),execution:vi.fn(async()=>{}),partner:vi.fn(async()=>{}),learning:vi.fn(async()=>{}),mcp:vi.fn(async()=>{}),conversation:vi.fn(()=>new Promise<void>(()=>{}))}));
vi.mock('../../lib/server/db/client',()=>({closeRuntimePool:vi.fn(async()=>{}),getOperationalFencePool:()=>({connect:async()=>({query:async()=>({rows:[{released:true}],rowCount:1}),release:vi.fn()})}),query:vi.fn(async()=>({rowCount:1,rows:[{generation:1}]})),withTransaction:async(run:(db:unknown)=>unknown)=>run({})}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'controlled-scheduler'})}));
vi.mock('../../lib/server/operations/code-version',()=>({operationalCodeVersion:()=> 'a'.repeat(40)}));
vi.mock('../../lib/server/conversations/watchdog',()=>({signMaintenanceRequest:vi.fn()}));
vi.mock('../../lib/server/operations/hosted-reconciliation',()=>({runHostedReconciliation:async()=>({backlog:0,truncated:false})}));
vi.mock('../../scripts/retrieval-worker',()=>({runRetrievalWorkerTick:async()=>{}}));
vi.mock('../../lib/server/staffing/runner',()=>({runWorkforceWorkerTick:calls.workforce}));
vi.mock('../../lib/server/staffing/worker-readiness',()=>({heartbeatWorkforceWorker:calls.heartbeat}));
vi.mock('../../lib/server/staffing/repository',()=>({requireStaffingEnvironment:async()=>{}}));
vi.mock('../../lib/server/operations/maintenance-bindings',async()=>{const {maintenanceClasses}=await import('../../lib/server/operations/maintenance');const operations:Record<string,()=>Promise<unknown>>={conversation:calls.conversation,workforce:calls.cleanup,execution:calls.execution,partners:calls.partner,learning:calls.learning,mcp:calls.mcp};return {createMaintenanceBindings:()=>maintenanceClasses.map(row=>({id:row.id,enabled:true,optional:false,intervalMs:row.id==='workforce'||row.id==='execution'?5000:row.intervalMs,tick:async()=>{await operations[row.id]?.();return {backlog:0,truncated:false};}}))};});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});
it('a stalled conversation watchdog blocks neither workforce, execution nor partner/learning maintenance and does not overlap ticks',async()=>{
 vi.useFakeTimers();vi.stubEnv('TURAS_EVE_INTERNAL_ORIGIN','http://127.0.0.1:19007/');vi.stubEnv('TURAS_WORKFORCE_STORE_ROOT','/tmp/controlled-synthetic-scheduler');
 const signals=['SIGINT','SIGTERM'] as const,existing=new Map(signals.map(signal=>[signal,process.listeners(signal)]));
 try{await import('../../scripts/maintenance-worker');await vi.advanceTimersByTimeAsync(15000);expect(calls.conversation).toHaveBeenCalledOnce();expect(calls.workforce).toHaveBeenCalledTimes(8);expect(calls.cleanup).toHaveBeenCalledTimes(4);expect(calls.heartbeat).toHaveBeenCalledTimes(4);expect(calls.execution).toHaveBeenCalledTimes(4);expect(calls.partner).toHaveBeenCalledOnce();expect(calls.learning).toHaveBeenCalledOnce();expect(calls.mcp).toHaveBeenCalledOnce();}
 finally{for(const signal of signals)for(const listener of process.listeners(signal))if(!existing.get(signal)?.includes(listener))process.removeListener(signal,listener);}
});
