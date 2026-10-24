import {Client} from 'pg';
import {spawn} from 'node:child_process';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withPilotEnvironment,requireOwnedPilotDatabase} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {verifyPilotSuiteResult} from './pilot-suite-results';
import {pilotPublishedKnowledgeFixture} from '../tests/fixtures/pilot/knowledge';
import {sessionCookieName} from '../lib/server/auth/sessions';
import {readOperationalHealth} from '../lib/server/operations/health';
import {closeRuntimePool} from '../lib/server/db/client';
export const pilotFaultFiles=[
 'tests/unit/pilot/storage-inventory.test.ts',
 'tests/integration/pilot/hosted-jobs.test.ts',
 'tests/integration/pilot/governed-execution.test.ts',
 'tests/integration/pilot/local-jobs.test.ts',
 'tests/integration/pilot/cost-authority.test.ts',
 'tests/integration/pilot/cost-command.test.ts',
 'tests/integration/pilot/maintenance-bindings.test.ts',
 'tests/integration/pilot/health.test.ts',
 'tests/integration/pilot/maintenance-worker.test.ts',
] as const;
/** Full fixed deterministic fault catalog plus an actual owned database outage.
 * Remote provider fixtures prove boundaries only, not remote fault behavior. */
export async function pilotFaults(){
 if(process.argv.length!==2)throw Error('Pilot fault catalog accepts no filters');process.umask(0o077);
 const source=await pilotSource();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/faults-'));const results:unknown[]=[];
 try{
  for(const [index,file] of pilotFaultFiles.entries())await withPilotEnvironment(async env=>{
   const output=join(root,`suite-${index}.json`),child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',file,'--reporter=json','--outputFile='+output],{cwd:env.appRoot,env:process.env,stdio:'ignore',signal:env.signal});
   const timer=setTimeout(()=>child.kill('SIGTERM'),240000);let code:number|null;try{code=await new Promise<number|null>((done,reject)=>{child.once('exit',done);child.once('error',reject);});}finally{clearTimeout(timer);}
   if(code!==0)throw Error('Owned fault suite failed: '+file);const result=verifyPilotSuiteResult(file,JSON.parse(await readFile(output,'utf8')));results.push({file,...result});console.info(JSON.stringify({file,passed:result.passedCases,providerCalls:0}));
  },{postgresMajor:18,deadlineMs:300000});
  await withPilotEnvironment(async env=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();let fixture;
   try{fixture=await pilotPublishedKnowledgeFixture(db as any,'primary');}finally{await db.end();await closeRuntimePool();}
   await env.start();const headers={cookie:sessionCookieName()+'='+fixture.actor.token},url=env.origin+'/api/customers/'+fixture.customerId+'/profile';
   const profile=async()=>{const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}),body=await response.json();if(response.status!==200||body.data?.customer?.id!==fixture.customerId||!body.data?.acceptedFacts?.length)throw Error('Reviewed profile unavailable before or after actual database outage');return response.status;};
   await profile();if((await readOperationalHealth()).database!=='healthy')throw Error('Initial owned database health unavailable');
   const started=performance.now();await env.stopDatabase();let recovered=false;
   try{
    const health=await readOperationalHealth();if(health.database!=='unavailable')throw Error('Stopped database falsely reports healthy');
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}),denial=await response.json();if(![401,403,500,503].includes(response.status)||denial.data||!denial.error)throw Error('Stopped database admitted a reviewed profile');
    const readiness=await fetch(env.origin+'/api/health/ready',{signal:AbortSignal.timeout(30000)}),body=await readiness.json();if(readiness.status!==503||JSON.stringify(body)!==JSON.stringify({ready:false}))throw Error('Stopped database readiness exposes unsafe output');
    await env.startDatabase();recovered=true;await profile();if((await readOperationalHealth()).database!=='healthy')throw Error('Restarted database remains unavailable');
    const result={caseId:'actual-owned-database-stop-start',pass:true,incidentToVerifiedProfileMs:performance.now()-started,acceptedFactsRetained:true,sourceSessionRetained:true,outageProfileStatus:response.status,fullServiceRpoRtoProof:false,hostedProof:false};results.push(result);await writeFile(join(root,'database-outage.json'),JSON.stringify(result));
   }finally{if(!recovered)await env.startDatabase();await closeRuntimePool();}
  },{postgresMajor:18,deadlineMs:300000});
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Fault catalog source changed');
  const receipt={contract:'pilot-owned-faults-v1',...source,completedAt:new Date().toISOString(),pass:true,results,providerFaults:'controlled SDK/domain fixtures',databaseFault:'actual owned PostgreSQL stop/start with HTTP denial and reviewed-profile recovery',providerCalls:0,hostedProof:false,operatorExerciseVerified:false};await writeFile(join(root,'completed.json'),JSON.stringify(receipt));console.info(JSON.stringify({root,pass:true,hostedProof:false}));return receipt;
 }catch(error){await writeFile(join(root,'failed.json'),JSON.stringify({...source,pass:false,reason:error instanceof Error?error.message:'Fault catalog failed',results}));throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotFaults().catch(error=>{console.error(error instanceof Error?error.message:'Pilot fault catalog failed');process.exitCode=1;});
