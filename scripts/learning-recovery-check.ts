import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withLearningEnvironment,requireOwnedLearningDatabase} from './learning-environment';
import {withLearningDatabase} from '../tests/fixtures/learning/environment';
import {seedLearningPublicPractice} from '../tests/fixtures/learning/setup';
import {learningNativeFixture} from '../tests/fixtures/learning/native';
import {activateLearning} from './learning-activate';
import {featureSourceDigest} from './execution-source-digest';
import {learningHash} from '../lib/server/learning/repository';
import {readPublishedKnowledge} from '../lib/server/knowledge/read';
import {learningDraftMeta,cancelLearningDraft} from '../lib/server/learning/advisory';
import {readLearningBudget} from '../lib/server/learning/budget';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../lib/server/staffing/native-admission';
import {runLearningMaintenanceTick} from '../lib/server/learning/maintenance';
import {scheduleLearningPayloadPurge} from '../lib/server/learning/retention';
import {capturePartnerProcess} from './test-partners';
import {verifyLearningTestReport} from './learning-suites';
async function predecessorDigest(){return withLearningDatabase(async db=>{
 const records=[];for(const query of ['SELECT id,login_name,active FROM principals ORDER BY id','SELECT id,workspace_id,customer_id,state,revision FROM customer_grants ORDER BY id','SELECT id,owner_principal_id,customer_id,binding_state FROM conversations ORDER BY id','SELECT id,current_accepted_revision_id FROM profile_records ORDER BY id','SELECT id,accepted_revision_id FROM execution_records ORDER BY id','SELECT id,revision_id,state,head_generation FROM knowledge_publications ORDER BY id'])records.push((await db.query(query)).rows);return learningHash(records);
});}
async function main(){
 if(process.argv.length!==2)throw Error('Recovery accepts no environment overrides');
 const sourceDigest=await featureSourceDigest('014');await mkdir('local-artifacts/014',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/014/recovery-')),results:unknown[]=[];
 for(const priorSchema of [undefined,51] as const)await withLearningEnvironment(async environment=>{
  const seeded=await withLearningDatabase(seedLearningPublicPractice),before=await predecessorDigest(),marker=randomUUID(),markerPath=join(environment.workflowRoot,'014-recovery-marker');await writeFile(markerPath,marker,{mode:0o600});
  if(priorSchema){await environment.startWorker();await environment.stop();assert.equal(await predecessorDigest(),before);await environment.upgradeToCurrent();}
  assert.equal(await predecessorDigest(),before);
  await withLearningDatabase(async db=>{assert.equal(Number((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version),54);assert.equal(Number((await db.query('SELECT count(*)::int n FROM turas_migrations')).rows[0].n),54);});
  const publication=await withLearningDatabase(async db=>(await db.query('SELECT id FROM knowledge_publications WHERE contribution_id=$1',[seeded.draft.id])).rows[0].id);
  await activateLearning(environment.environmentId,seeded.actors.admin.workspaceId,true,requireOwnedLearningDatabase(process.env,true));
  const first=await withLearningDatabase(async db=>(await db.query('SELECT gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[seeded.actors.admin.workspaceId])).rows[0].gate_activated_at);
  await activateLearning(environment.environmentId,seeded.actors.admin.workspaceId,false,requireOwnedLearningDatabase(process.env,true));
  await withLearningDatabase(async db=>{assert.equal((await db.query('SELECT gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[seeded.actors.admin.workspaceId])).rows[0].gate_activated_at.getTime(),first.getTime());assert.equal(Number((await db.query('SELECT count(*)::int n FROM learning_legacy_heads WHERE publication_id=$1',[publication])).rows[0].n),1);await assert.rejects(db.query('UPDATE knowledge_publications SET head_generation=head_generation+1 WHERE id=$1',[publication]),{code:'23514'});});
  await withLearningDatabase(async db=>{assert.equal((await db.query('SELECT current_user AS role')).rows[0].role,'turas_runtime');assert.equal((await db.query("SELECT has_table_privilege(current_user,'learning_budget_reservations','INSERT') AS write,has_table_privilege(current_user,'learning_budget_settlements','DELETE') AS erase,has_table_privilege(current_user,'learning_workspace_state','UPDATE') AS activate")).rows[0].write,true);assert.equal((await db.query("SELECT has_table_privilege(current_user,'learning_budget_settlements','DELETE') AS erase,has_table_privilege(current_user,'learning_workspace_state','UPDATE') AS activate")).rows[0].erase,false);await assert.rejects(db.query('UPDATE learning_workspace_state SET enabled=true'),{code:'42501'});assert.equal((await readPublishedKnowledge(db,seeded.actors.admin,publication)).payload.title,'Canonical synthetic learning practice');},false);
  assert.equal(await predecessorDigest(),before);
  // A provider claim with no settlement remains unknown through crash/recovery.
  const f=await withLearningDatabase(db=>learningNativeFixture(db));await admitGovernedStaffingModelStep(f.principal,f.identity);await assertGovernedStaffingProviderRelease(f.principal,f.identity);
  const current=await learningDraftMeta(f.actor,f.meta.id);await cancelLearningDraft(f.actor,f.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:current.version,rationale:'Synthetic interrupted-provider recovery'});
  const early=new Date(Date.now()+3600000);await withLearningDatabase(async db=>{await scheduleLearningPayloadPurge(db,f.meta.id,'attempt','global_invalidated',new Date(),early);await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);});
  await environment.startWorker();await environment.crashWorker();await environment.startWorker();await environment.stop();
  await runLearningMaintenanceTick({nativeRetirement:false});assert.equal((await readLearningBudget(f.actors.admin,f.meta.budgetId)).blocked,true);
  await withLearningDatabase(async db=>{assert.equal((await db.query("SELECT purge_at FROM learning_payload_states WHERE kind='attempt' AND owner_id=$1",[f.meta.id])).rows[0].purge_at.getTime(),early.getTime());assert.equal(Number((await db.query('SELECT count(*)::int n FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n),0);});
  assert.equal(await readFile(markerPath,'utf8'),marker);
  const restartIdentity=await predecessorDigest();
  for(let restart=0;restart<2;restart++){
   await environment.startNative();
   const response=await fetch(environment.origin+'/api/learning/drafts/'+f.meta.id,{headers:{cookie:'turas_session='+f.actor.token},signal:AbortSignal.timeout(90000)});assert.equal(response.status,200);const recovered=await response.json();assert.equal(recovered.data.id,f.meta.id);assert.equal(recovered.data.state,'cancelled');
   await environment.stop();assert.equal(await readFile(markerPath,'utf8'),marker);assert.equal(await predecessorDigest(),restartIdentity);
  }
  // Exact registered recovery assertions exercise disabled reads, source loss,
  // unknown holds and interrupted final retirement claims against this database.
  const files=['tests/integration/learning-maintenance.test.ts'],report=join(directory,`schema-${priorSchema??'empty'}.json`),run=await capturePartnerProcess(['node_modules/vitest/vitest.mjs','run',...files,'--reporter=json','--outputFile='+report,'--testTimeout=120000'],240000,environment.signal);await writeFile(report+'.log',run.stdout+run.stderr,{mode:0o600});if(run.status!==0||run.error)throw Error('Recovery domain checks failed; inspect '+directory);const passed=verifyLearningTestReport(JSON.parse(await readFile(report,'utf8')),files);
  results.push({from:priorSchema??'empty',to:54,domainChecks:passed,activationSnapshot:true,oldWriterDenied:true,runtimeGrants:true,workerCrashAndSigterm:true,authenticatedNativeAppRestarts:2,sameDatabaseAndWorkflow:true,unknownCostHeld:true,earliestDeadlinePreserved:true});
 },{priorSchema,deadlineMs:600000});
 assert.equal(await featureSourceDigest('014'),sourceDigest);const summary={sourceDigest,results,paidCalls:0,hostedProof:false};await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Learning recovery failed');process.exitCode=1;});
