import {afterAll,it,expect} from 'vitest';
import {observeMaintenanceHealth} from '../../../lib/server/operations/maintenance-health';
import {Client} from 'pg';
import {spawn,type ChildProcess} from 'node:child_process';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
requireOwnedPilotDatabase();
const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});
afterAll(()=>owner.end());
it('records completed ticks for all classes after the owned worker starts and restarts',async()=>{
 await owner.connect();let child:ChildProcess|undefined;
 const stop=async(signal:'SIGTERM'|'SIGKILL')=>{if(!child)return;const current=child;child=undefined;if(current.exitCode===null){current.kill(signal);await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>{current.kill('SIGKILL');reject(Error('Owned worker stop deadline'));},5000);current.once('exit',()=>{clearTimeout(timer);done();});});}};
 try{for(const iteration of [0,1]){
  const generations=new Map((await owner.query('SELECT class_id,generation FROM operations_maintenance_status WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID])).rows.map(row=>[row.class_id,Number(row.generation)]));
  const startedAt=(await owner.query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
  child=spawn(process.execPath,['--import','tsx','scripts/maintenance-worker.ts'],{cwd:process.cwd(),env:{...process.env,TURAS_005_DISABLED:'1',TURAS_007_DISABLED:'1',TURAS_EVE_INTERNAL_ORIGIN:'http://127.0.0.1:19016/'},stdio:'ignore'});
  const deadline=Date.now()+10000;let rows:Record<string,any>[]=[];
  for(;;){rows=(await owner.query('SELECT class_id,last_success_at,safe_failure,code_version,generation,lease_id FROM operations_maintenance_status WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID])).rows;if(rows.length===15&&rows.every(row=>row.last_success_at>=startedAt&&row.safe_failure===null&&row.code_version===process.env.TURAS_CODE_VERSION&&row.lease_id===null&&Number(row.generation)>(generations.get(row.class_id)??0)))break;if(child.exitCode!==null||Date.now()>=deadline)throw Error('Owned worker did not complete every required class');await new Promise(done=>setTimeout(done,100));}
  for(const row of rows)expect(row.code_version).toBe(process.env.TURAS_CODE_VERSION);
  expect((await owner.query('SELECT bool_and(last_completed_at=last_success_at) AS same FROM operations_maintenance_status WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID])).rows[0].same).toBe(true);
  await stop(iteration===0?'SIGKILL':'SIGTERM');
  if(iteration===0){
   // Real elapsed outage, with no fake clock or rewritten last-success timestamp.
   const stoppedAt=Date.now(),outageDeadline=stoppedAt+120000;
   for(;;){const health=await observeMaintenanceHealth();
    if(health.classes.every(row=>row.state==='stale')){expect(health.healthy).toBe(false);expect(Date.now()-stoppedAt).toBeLessThan(300000);break;}
    if(Date.now()>=outageDeadline)throw Error('Stopped required classes were not detected within the observation bound');
    await new Promise(done=>setTimeout(done,1000));
   }
  }
 }}finally{await stop('SIGTERM');}
},150000);
