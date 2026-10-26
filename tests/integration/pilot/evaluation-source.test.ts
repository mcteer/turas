import {it,expect} from 'vitest';
import {Client} from 'pg';
import {withPilotEnvironment} from '../../../scripts/pilot-environment';
import {requireEvaluationSourceDatabase} from '../../../scripts/eval-source-database';
import {withArtifactEvalEnvironment} from '../../../scripts/artifact-eval-environment';
import {withRetrievalEvalEnvironment} from '../../../scripts/retrieval-eval-environment';
import {withPlanEvalEnvironment} from '../../../scripts/plan-eval-environment';
it('admits actual owned sources and prepares artifact retrieval and plan clones without model dispatch',async()=>{
 const started=performance.now();
 const observe=(phase:'artifact'|'retrieval'|'plan',state:'start'|'complete')=>{
  try{process.stderr.write(JSON.stringify({kind:'evaluation_source_stage',phase,state,elapsedMs:Math.floor(performance.now()-started)})+'\n');}
  catch{/* Diagnostic output cannot replace the original check. */}
 };
 await withPilotEnvironment(async environment=>{
  process.env.TURAS_TEST_POSTGRES_CONTAINER=environment.databaseContainer;
  expect(requireEvaluationSourceDatabase()).toBe(process.env.DATABASE_URL_UNPOOLED);
  expect(process.env.AI_GATEWAY_API_KEY).toBeUndefined();expect(process.env.CONTEXT_API_KEY).toBeUndefined();
  const source=process.env.DATABASE_URL_UNPOOLED,marker=process.env.TURAS_ENVIRONMENT_ID;
  const probe=async()=>{const raw=process.env.DATABASE_URL_UNPOOLED!;expect(raw).not.toBe(source);expect(raw).toBe(process.env.TURAS_TEST_DATABASE_URL);expect(process.env.TURAS_ENVIRONMENT_ID).toBe(marker);const db=new Client({connectionString:raw});try{await db.connect();expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows).toEqual([{environment_id:marker,schema_version:79}]);}finally{await db.end();}};
  observe('artifact','start');await withArtifactEvalEnvironment(probe,{production:true,deadlineAt:environment.deadlineAt});observe('artifact','complete');expect(process.env.DATABASE_URL_UNPOOLED).toBe(source);
  observe('retrieval','start');await withRetrievalEvalEnvironment(probe);observe('retrieval','complete');expect(process.env.DATABASE_URL_UNPOOLED).toBe(source);
  observe('plan','start');await withPlanEvalEnvironment(async clone=>{await clone.start();await probe();},{production:true,deadlineAt:environment.deadlineAt});observe('plan','complete');expect(process.env.DATABASE_URL_UNPOOLED).toBe(source);
 },{postgresMajor:18,deadlineMs:600000});
},630000);
it('seeds the governing behavior demo separately from the judged retrieval walkthrough',async()=>{
 const {qualityStages,qualitySeedCommand}=await import('../../../scripts/pilot-quality-live');
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 await withPilotEnvironment(async environment=>{
  const seed=async(id:string)=>{const stage=qualityStages.find(s=>s.id===id)!;await promisify(execFile)(process.execPath,['--import','tsx',...qualitySeedCommand(stage)],{cwd:environment.appRoot,env:process.env,timeout:90000,maxBuffer:1048576});};
  const db=new Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await db.connect();
  try{
   await seed('003');
   const counts=async()=>(await db.query(`SELECT count(*)::int AS accepted,count(*) FILTER(WHERE v.payload->>'kind'='product_use')::int AS product_uses FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id`)).rows[0];
   expect(await counts()).toEqual({accepted:3,product_uses:1});
   await seed('005-retrieval');expect(await counts()).toEqual({accepted:25,product_uses:3});
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
it('installs the actual budget guard in the owned maintenance process before readiness',async()=>{
 const {mkdtemp,readdir,rm}=await import('node:fs/promises'),{join,resolve}=await import('node:path'),{randomUUID}=await import('node:crypto');
 const {pilotSource}=await import('../../../scripts/pilot-source'),{QualityBudgetLedger}=await import('../../../scripts/pilot-quality-budget-ledger'),{writeEvidence,readEvidence}=await import('../../../scripts/pilot-evidence');
 const root=await mkdtemp(resolve('local-artifacts/016/worker-budget-test-'));
 try{
  const source=await pilotSource(),id=randomUUID(),authorizationDigest='a'.repeat(64),expiresAt=new Date(Date.now()+300000).toISOString();
  const ledger=await QualityBudgetLedger.create(join(root,'budget'),{contract:'pilot-quality-budget-v1',id,sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest,authorizationDigest,capMicroUsd:1,modelId:'spacexai/grok-4.7',expiresAt});
  await writeEvidence(root,'runtime.json',{contract:'pilot-quality-runtime-v1',id,sourceRoot:process.cwd(),ledgerRoot:ledger.root,...source,authorizationDigest,capMicroUsd:1,expiresAt});
  await withPilotEnvironment(async environment=>{
   process.env.TURAS_016_QUALITY_RUNTIME_FILE=join(root,'runtime.json');process.env.TURAS_ALLOW_LIVE_MODEL_TESTS='1';process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';
   await environment.startWorker();
   const guards=(await readdir(root)).filter(n=>n.startsWith('model-guard-installed-'));
   expect(guards.length).toBeGreaterThan(0);expect(environment.workerPid()).not.toBeNull();
   for(const name of guards)expect(await readEvidence(root,name)).toMatchObject({contract:'pilot-quality-guard-v1',budgetId:id,processId:environment.workerPid(),sourceDigest:source.sourceDigest,providerDispatched:false});
   expect(await ledger.status()).toMatchObject({dispatches:0,contextDispatches:0,chargedMicroUsd:0});
  },{postgresMajor:18,deadlineMs:90000});
 }finally{await rm(root,{recursive:true,force:true});}
},120000);
