import {randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withExpansionEvalEnvironment,requireOwnedExpansionClone} from './expansion-eval-environment';
import {featureSourceDigest} from './execution-source-digest';
import {createExpansionActors} from '../tests/fixtures/expansion/seed';
import {installExpansionNativeFixture} from '../tests/fixtures/expansion/native-install';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {getServerConfig} from '../lib/server/config';
import {expansionAdvicePrompt} from '../lib/expansion/advice';
import {Client} from 'pg';
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
let recoveryPhase='source_preflight';
let recoveryCohort:string|null=null;
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--disposable','Expansion recovery requires --disposable and takes no database overrides');const sourceDigest=await featureSourceDigest('011');const currentSchema=JSON.parse(await readFile('migrations/manifest.json','utf8')).version;check(Number.isSafeInteger(currentSchema)&&currentSchema>=47,'Current migration manifest required');const url=process.env.TURAS_TEST_DATABASE_URL;check(url&&new URL(url).pathname==='/turas_test_011_source','Owned source environment required');
 const source=new Client({connectionString:url});await source.connect();const original=(await source.query('SELECT environment_id,schema_version FROM turas_environment')).rows;await source.end();const preservedEnvironment=process.env.TURAS_ENVIRONMENT_ID;
 await mkdir('local-artifacts/011',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/011/recovery-'));const cohorts:unknown[]=[];
 try{for(const priorSchema of [undefined,45] as const)await withExpansionEvalEnvironment(async environment=>{
  recoveryCohort=priorSchema===45?'045':'empty';recoveryPhase='schema_validation';
  requireOwnedExpansionClone();await createExpansionActors(environment.appRoot);const marker=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows[0];if(priorSchema===45){check(marker.schema_version===45,'Prior schema fixture missing');check(!(await query("SELECT to_regclass('public.expansion_scopes') AS table_name")).rows[0].table_name,'Future tables leaked into 045');await environment.upgradeToCurrent();}
  const current=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows[0];check(current.environment_id===marker.environment_id&&current.schema_version===currentSchema,'Owned upgrade changed marker or omitted current schema');
  const privileges=(await query(`SELECT has_table_privilege('turas_runtime','expansion_revisions','DELETE') AS revision_delete,
    has_table_privilege('turas_runtime','expansion_advice_payloads','DELETE') AS payload_delete,
    has_table_privilege('turas_runtime','expansion_advice_minimizations','INSERT') AS forged_minimization,
    has_function_privilege('turas_runtime','turas_purge_expansion_advice(uuid,uuid)','EXECUTE') AS governed_purge,
    has_function_privilege('turas_runtime','turas_minimize_expansion_advice(text,integer)','EXECUTE') AS governed_minimization`)).rows[0];check(!privileges.revision_delete&&!privileges.payload_delete&&!privileges.forged_minimization&&privileges.governed_purge&&privileges.governed_minimization,'Runtime retention privilege boundary failed');
  recoveryPhase='install_fixture';await installExpansionNativeFixture(environment);const previous=process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY='1';try{
   const customerId=randomUUID();await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic expansion recovery',true)",[customerId,DEMO_IDS.workspace]);recoveryPhase='runtime_start';await environment.start();const workflow=await realpath(environment.workflowRoot),sentinel=join(workflow,'.expansion-recovery-sentinel'),value=randomUUID();await writeFile(sentinel,value,{mode:0o600});
   recoveryPhase='login';const login=await fetch(`${environment.origin}/api/auth/login`,{method:'POST',headers:{origin:environment.origin,'content-type':'application/json'},body:JSON.stringify({username:'panel',password:getServerConfig().PANEL_PASSWORD})});const cookie=login.headers.get('set-cookie')?.split(';')[0];await login.body?.cancel();check(login.ok&&cookie,'Owned recovery login failed');const auth=await fetch(`${environment.origin}/api/auth/session`,{headers:{cookie}});const csrf=(await auth.json()).data.csrfToken;
   async function post(path:string,input:unknown,extra:Record<string,string>={}){const response=await fetch(`${environment.origin}${path}`,{method:'POST',headers:{cookie:cookie!,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrf,...extra},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});const body=await response.json();check(response.ok,'Owned recovery command failed');return body;}
   const requestKey=randomUUID(),input={contractVersion:'expansion-v1',expectedVersion:0,requestKey,workloadId:null,question:'Which need should the operating owner verify?',sourceRefs:[],selectedEngagementIds:[],selectedHypothesisIds:[]};recoveryPhase='prepare';const prepared=(await post(`/api/expansion/customers/${customerId}/advice`,input)).data;recoveryPhase='before_dispatch_restart';await environment.restart();check(await realpath(environment.workflowRoot)===workflow&&await readFile(sentinel,'utf8')===value,'Workflow directory changed before dispatch');
   recoveryPhase='preparation_replay';const replay=(await post(`/api/expansion/customers/${customerId}/advice`,input)).data;check(replay.attemptId===prepared.attemptId&&replay.conversationId===prepared.conversationId,'Preparation replay changed owned identity');check(Number((await query('SELECT count(*) AS n FROM expansion_native_fixture_calls')).rows[0].n)===0,'Before-dispatch restart paid a provider');
   recoveryPhase='native_binding';const bound=await post('/eve/v1/session',{operationId:prepared.operationId},{'x-turas-conversation-id':prepared.conversationId});recoveryPhase='dispatch';const response=await fetch(`${environment.origin}/eve/v1/session/${bound.sessionId}`,{method:'POST',headers:{cookie,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrf,'x-turas-conversation-id':prepared.conversationId,'x-turas-request-key':prepared.nativeRequestId},body:JSON.stringify({message:expansionAdvicePrompt}),signal:AbortSignal.timeout(20000)});check(response.ok,'Owned dispatch denied');await response.body?.cancel();recoveryPhase='settlement';const deadline=Date.now()+120000;for(;;){const row=(await query('SELECT state FROM expansion_advice_attempts WHERE id=$1',[prepared.attemptId])).rows[0];if(row.state==='completed')break;check(['prepared','running'].includes(row.state)&&Date.now()<deadline,'Owned recovery advice failed to complete');await new Promise(resolve=>setTimeout(resolve,250));}
   recoveryPhase='completed_restart';await environment.restart();check(await readFile(sentinel,'utf8')===value,'Unrelated workflow sentinel lost after dispatch');recoveryPhase='completed_status';const status=await fetch(`${environment.origin}/api/expansion/customers/${customerId}/advice/${prepared.attemptId}`,{headers:{cookie},cache:'no-store'});check(status.ok&&(await status.json()).data.result,'Completed current advice missing after restart');check(Number((await query('SELECT count(*) AS n FROM expansion_native_fixture_calls')).rows[0].n)===2,'Restart repeated provider work');
   cohorts.push({startingSchema:priorSchema??'empty',finalSchema:47,environmentPreserved:true,beforeDispatchRestart:true,completedRestart:true,preparationReplay:true,workflowPreserved:true,providerCalls:2,actualConfiguredProvider:false,rootAgentDigest:environment.rootAgentDigest});
  }finally{await environment.stop();await closeRuntimePool();if(previous===undefined)delete process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;else process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY=previous;}
 },{empty:true,priorSchema,deadlineAt:Date.now()+420000});
 recoveryPhase='source_preservation';const verified=new Client({connectionString:url});await verified.connect();const finalSource=(await verified.query('SELECT environment_id,schema_version FROM turas_environment')).rows;await verified.end();check(process.env.TURAS_ENVIRONMENT_ID===preservedEnvironment&&JSON.stringify(finalSource)===JSON.stringify(original),'Selected source environment changed');check(await featureSourceDigest('011')===sourceDigest,'Recovery source changed');const evidence={gate:'expansion-recovery',sourceDigest,cohorts,selectedEnvironmentPreserved:true,actualFrameworkRuntime:true,hostedProof:false};await writeFile(resolve(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600});console.log(JSON.stringify(evidence));
 }finally{await source.end().catch(()=>{});}
}
main().catch(async error=>{
 await mkdir('local-artifacts/011',{recursive:true,mode:0o700}).catch(()=>{});
 await writeFile(resolve(`local-artifacts/011/recovery-failure-${randomUUID()}.json`),JSON.stringify({
  phase:recoveryPhase,cohort:recoveryCohort,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack?.slice(0,8000)}:{name:'UnknownError'},
 }),{mode:0o600,flag:'wx'}).catch(()=>{});
 const category=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?error.name:'check_failed';
 console.error(JSON.stringify({gate:'expansion-recovery-failure',phase:recoveryPhase,cohort:recoveryCohort,category}));process.exitCode=1;
});
