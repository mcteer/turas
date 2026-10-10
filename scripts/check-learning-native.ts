import {mkdir,writeFile} from 'node:fs/promises';
import {learningNativeRunPayloads} from '../tests/fixtures/learning/native-store';
import {randomUUID} from 'node:crypto';
import {withLearningEnvironment} from './learning-environment';
import {withLearningDatabase} from '../tests/fixtures/learning/environment';
import {installLearningNativeFixture} from '../tests/fixtures/learning/native-install';
import {installLearningSyntheticPrice,learningPreparedNativeDraft} from '../tests/fixtures/learning/native-preparation';
import {readLearningDraft,saveLearningDraft} from '../lib/server/learning/drafts';
import {reconcileLearningLifecycle} from '../lib/server/learning/lifecycle';
import {processLearningNativeRetirement} from '../lib/server/learning/native-retirement';
import {learningDraftMeta} from '../lib/server/learning/advisory';
import {learningDraftPrompt,learningEvaluationPrompt} from '../lib/contracts/learning';
import {learningPreparedEvaluation} from '../tests/fixtures/learning/completed-evaluation';
import {readLearningEvaluation} from '../lib/server/learning/evaluation-captures';
import {prepareLearningEvaluationArm} from '../lib/server/learning/evaluation';
import type {CurrentSession} from '../lib/server/auth/sessions';
import {featureSourceDigest} from './execution-source-digest';
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
if(process.argv.length!==2)throw Error('Learning native acceptance takes no filters');
const digest=await featureSourceDigest('014');let checks=0;
await withLearningEnvironment(async environment=>{
 await installLearningNativeFixture(environment);installLearningSyntheticPrice();
 const nativeSessionIds:string[]=[];const drafts=[];for(const mode of ['normal','malformed','unknown','overrun','forbidden','all_reads'] as const)drafts.push({mode,fixture:await withLearningDatabase(db=>learningPreparedNativeDraft(db,mode))});
 const evaluation=await withLearningDatabase(learningPreparedEvaluation);
 await environment.startNative();await environment.startWorker();
 async function dispatch(actor:CurrentSession,meta:{conversationId:string;operationId:string;nativeRequestId:string},prompt:string){
  const cookie=`turas_session=${actor.token}`,session=await fetch(`${environment.origin}/api/auth/session`,{headers:{cookie}}),auth=await session.json();assert(session.ok&&auth.data?.csrfToken,'Native learning auth required');
  const headers={cookie,origin:environment.origin,'content-type':'application/json','x-csrf-token':String(auth.data.csrfToken),'x-turas-conversation-id':meta.conversationId};
  const bind=await fetch(`${environment.origin}/eve/v1/session`,{method:'POST',headers,body:JSON.stringify({operationId:meta.operationId}),signal:AbortSignal.timeout(20000)}),binding=await bind.json().catch(()=>({}));assert(bind.ok&&binding.sessionId,'Native learning session binding failed');
  const response=await fetch(`${environment.origin}/eve/v1/session/${binding.sessionId}`,{method:'POST',headers:{...headers,'x-turas-request-key':meta.nativeRequestId},body:JSON.stringify({message:prompt}),signal:AbortSignal.timeout(45000)});assert(response.ok,'Native learning dispatch denied');
  if(response.body){const reader=response.body.getReader();let bytes=0;try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;assert(bytes<=2097152,'Native stream exceeds fixture bound');}}finally{await reader.cancel();}}
  return binding.sessionId as string;
 }
 for(const {mode,fixture:f} of drafts){
  const nativeSessionId=await dispatch(f.actor,{conversationId:f.meta.conversationId,operationId:f.meta.operationId,nativeRequestId:f.meta.nativeRequestId},learningDraftPrompt);nativeSessionIds.push(nativeSessionId);
  let current=await learningDraftMeta(f.actor,f.meta.id);const deadline=Date.now()+20000;while(['prepared','admitted','running'].includes(current.state)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,200));current=await learningDraftMeta(f.actor,f.meta.id);}
  assert(current.state===(mode==='normal'?'completed':['unknown','forbidden'].includes(mode)?'unconfirmed':'failed'),`Native ${mode} terminal state mismatch (${current.state}; ${current.failureCode??'none'})`);
  await withLearningDatabase(async db=>{
   const calls=(await db.query('SELECT * FROM learning_native_fixture_calls WHERE response_attempt_id=(SELECT response_attempt_id FROM learning_attempts WHERE id=$1) ORDER BY step_index',[f.meta.id])).rows;assert(calls.length===(mode==='normal'?2:1),`Native ${mode} invocation count mismatch`);assert(calls.every(c=>c.max_output_tokens===4096),'Native output cap missing');
   const history=(await db.query('SELECT visible_payload FROM event_projections WHERE native_session_id=$1',[nativeSessionId])).rows;assert(history.every(row=>JSON.stringify(row.visible_payload)==='{}'),'Native learning history retained private prose');
   if(mode==='all_reads')assert((await db.query('SELECT read_calls FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].read_calls===3,'All three governed reads must execute before cumulative input withholding');
   const amounts=(await db.query('SELECT count(*)::int n FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0];assert(amounts.n===(['unknown','forbidden'].includes(mode)?0:calls.length),'Native accounting coverage mismatch');
  });
  const nativeRead=await fetch(`${environment.origin}/eve/v1/session/${nativeSessionId}`,{headers:{cookie:`turas_session=${f.actor.token}`}});assert(!nativeRead.ok,'Learning native history must remain closed');await nativeRead.body?.cancel();
  if(mode==='normal'){
   const initial=await learningNativeRunPayloads(environment.workflowRoot,[nativeSessionId]);assert(initial.payloadRecords>0,'Native retention probe needs a positive encrypted-payload control');
   const output=await readLearningDraft(f.actor,f.meta.id),command={contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:output.version,proposalIndex:0,outputDigest:output.outputDigest,payload:output.output.proposal};
   const saved=await saveLearningDraft(f.actor,f.meta.id,command);assert((await saveLearningDraft(f.actor,f.meta.id,command)).targetId===saved.targetId,'Real native save must replay once');
   await withLearningDatabase(async db=>{assert((await db.query('SELECT state FROM knowledge_contributions WHERE id=$1',[saved.targetId])).rows[0]?.state==='draft','Native draft cannot publish itself');await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[f.lineage.sourceRevisionId]);});
   await reconcileLearningLifecycle(new Date(),f.meta.id);let denied=false;try{await readLearningDraft(f.actor,f.meta.id);}catch{denied=true;}assert(denied,'Source loss must immediately withhold a real native capture');
  }
  checks++;
 }
 for(let ordinal=0;ordinal<16;ordinal++){
  const view=await readLearningEvaluation(evaluation.actors.admin,evaluation.evaluationId),arm=await prepareLearningEvaluationArm(evaluation.actors.admin,evaluation.evaluationId,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version,rationale:'Synthetic real eve isolated fixed-case arm'});
  const meta=await withLearningDatabase(async db=>(await db.query('SELECT a.conversation_id,a.native_request_id,c.creation_operation_id FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1',[arm.targetId])).rows[0]);
  nativeSessionIds.push(await dispatch(evaluation.actors.admin,{conversationId:meta.conversation_id,operationId:meta.creation_operation_id,nativeRequestId:meta.native_request_id},learningEvaluationPrompt));
  const deadline=Date.now()+20000;let terminal;do{terminal=await withLearningDatabase(async db=>(await db.query('SELECT state,failure_code,output_digest FROM learning_attempts WHERE id=$1',[arm.targetId])).rows[0]);if(!['prepared','admitted','running'].includes(terminal.state))break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);
  assert(terminal?.state==='completed'&&terminal.output_digest,`Native paired arm ${ordinal+1} incomplete (${terminal?.state}; ${terminal?.failure_code??'none'})`);checks++;
 }
 const reviewed=await readLearningEvaluation(evaluation.actors.admin,evaluation.evaluationId);assert(reviewed.state==='awaiting_review','Real native evaluation must require human review');
 await withLearningDatabase(async db=>{const calls=(await db.query(`SELECT f.tools FROM learning_native_fixture_calls f JOIN learning_attempts a ON a.response_attempt_id=f.response_attempt_id JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1`,[evaluation.evaluationId])).rows;assert(calls.length===16&&calls.every(c=>c.tools.length===0),'Real evaluation arms must use no tools');const sessions=(await db.query('SELECT count(DISTINCT a.native_session_id)::int n FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1',[evaluation.evaluationId])).rows[0];assert(sessions.n===16,'Each evaluation arm needs a fresh private native session');});
 await withLearningDatabase(async db=>{await db.query('DELETE FROM learning_native_fixture_retirement_hold');await db.query("UPDATE learning_cleanup_jobs SET next_attempt_at=clock_timestamp() WHERE state='pending'");});
 // Exercise the actual protected hosted-watchdog adapter in the owned eve service.
 await environment.crashWorker();const hosted=await fetch(`${environment.origin}/eve/v1/turas/watchdog`,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(90000)});if(!hosted.ok){let code='unknown';try{const body=await hosted.json();if(typeof body?.error?.code==='string'&&/^[a-z_]{1,80}$/.test(body.error.code))code=body.error.code;}catch{}throw Error(`Owned hosted learning maintenance failed (${hosted.status}; ${code})`);}await hosted.body?.cancel();const hostedDeadline=Date.now()+75000;let retiredCount=0;while(Date.now()<hostedDeadline){retiredCount=await withLearningDatabase(async db=>Number((await db.query('SELECT count(*)::int n FROM learning_native_retirement_receipts')).rows[0].n));if(retiredCount===22)break;await new Promise(r=>setTimeout(r,200));}assert(retiredCount===22,'Actual hosted adapter must retire all owned native sessions');checks++;
 // Run the same cleanup implementation against the real owned eve service.
 for(let index=0;index<32;index++){if(!await processLearningNativeRetirement())break;}
 await withLearningDatabase(async db=>{const receipts=(await db.query('SELECT count(*)::int n FROM learning_native_retirement_receipts')).rows[0];assert(receipts.n===22,'Every real native session requires its exact retirement receipt');});checks++;
 // Inspect only the fresh owned fixture store, without printing any payload.
 let retired=await learningNativeRunPayloads(environment.workflowRoot,nativeSessionIds);const purgeDeadline=Date.now()+10000;while(retired.payloadRecords&&Date.now()<purgeDeadline){await new Promise(r=>setTimeout(r,200));retired=await learningNativeRunPayloads(environment.workflowRoot,nativeSessionIds);}if(retired.payloadRecords)console.info(JSON.stringify({kind:'synthetic_native_retention',...retired}));assert(retired.payloadRecords===0,`Retired native storage retains ${retired.payloadRecords} payload-bearing records`);checks++;assert((await readLearningEvaluation(evaluation.actors.admin,evaluation.evaluationId)).state==='awaiting_review','Governed paired captures must survive native retirement');
},{deadlineMs:900000});
assert(await featureSourceDigest('014')===digest,'Learning native source changed');const summary={sourceDigest:digest,checks,paidCalls:0,actualModelQuality:false};await mkdir('local-artifacts/014',{recursive:true,mode:0o700});await writeFile('local-artifacts/014/native.summary.json',JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
