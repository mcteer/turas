import {createHash,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {fenceSpecialistCancellation,admitSpecialistCall,lockOwnedDiscussion} from '../../lib/server/research/specialists/discussions';
import {withTransaction} from '../../lib/server/db/client';
import {reserveLockedSpecialistOperation,settleSpecialistOperation} from '../../lib/server/research/specialists/discussion-budget';
import {reserveOrdinaryOutput} from '../../lib/server/conversations/token-allowance';
import {guardSpecialistProvider} from '../../lib/server/research/specialists/discussion-provider';
import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {prepareResearch} from '../../lib/server/research/specialists/research-cache/requests';
const url=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(url);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('keeps discussion authority immutable and allows only one active assignment',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','admin');
  const customer=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Specialist schema fixture',false)",[customer,actor.workspaceId]);
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key,customerId:customer});
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query('INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now())',[process.env.TURAS_ENVIRONMENT_ID,'specialist-schema-'+key]);
  const {attemptId}=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Research this customer.');
  await claimDispatch(actor,conversation.id,attemptId,0);
  await db.query('SET ROLE turas_runtime');
  const discussion=randomUUID();
  await db.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,'solution','platform',$7,$8,$9,$10,$11,$12,$12,400000,32000,3000000,clock_timestamp()+interval '5 minutes')`,[discussion,conversation.id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,customer,native,randomUUID(),randomUUID(),attemptId,randomUUID(),'a'.repeat(64)]);
  for(const statement of ["UPDATE specialist_discussions SET control_hook_token=gen_random_uuid()::text WHERE id=$1","UPDATE specialist_discussions SET expires_at=expires_at+interval '1 second' WHERE id=$1","UPDATE specialist_discussions SET owner_principal_id=gen_random_uuid() WHERE id=$1","UPDATE specialist_discussions SET cost_ceiling_micro_usd=4000000 WHERE id=$1"])
   await expect(db.query(statement,[discussion])).rejects.toMatchObject({code:'23514'});
  const insert=`INSERT INTO specialist_assignments(id,discussion_id,parent_session_id,ordinal,attempt_id,request_key,input_digest,call_id,research_key,lease_id,authority_expires_at)
   SELECT $1,id,parent_session_id,$2,$3,$4,$5,$6,'fixture',$7,expires_at FROM specialist_discussions WHERE id=$8`;
  const assignment=randomUUID();
  await db.query(insert,[assignment,1,attemptId,randomUUID(),'b'.repeat(64),randomUUID(),randomUUID(),discussion]);
  await expect(db.query(insert,[randomUUID(),2,attemptId,randomUUID(),'c'.repeat(64),randomUUID(),randomUUID(),discussion])).rejects.toMatchObject({code:'23505'});
  await db.query("UPDATE specialist_assignments SET state='completed',terminal_line=1,terminal_index=0,result_reference='{}'::jsonb,result_delivered_at=clock_timestamp() WHERE id=$1",[assignment]);
  await expect(db.query("UPDATE specialist_assignments SET state='working' WHERE id=$1",[assignment])).rejects.toMatchObject({code:'23514'});
  for(const field of ["terminal_line=2","terminal_index=1","result_reference='null'::jsonb","result_delivered_at=clock_timestamp()+interval '1 second'"])await expect(db.query('UPDATE specialist_assignments SET '+field+' WHERE id=$1',[assignment])).rejects.toMatchObject({code:'23514'});
  await db.query(insert,[randomUUID(),2,attemptId,randomUUID(),'c'.repeat(64),randomUUID(),randomUUID(),discussion]);
  const other=randomUUID();
  await db.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at)
   SELECT $1,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,$2,$3,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at FROM specialist_discussions WHERE id=$4`,[other,randomUUID(),randomUUID(),discussion]);
  const repeated=(await db.query('SELECT call_id FROM specialist_assignments WHERE id=$1',[assignment])).rows[0].call_id;
  await expect(db.query(insert,[randomUUID(),1,attemptId,randomUUID(),'d'.repeat(64),repeated,randomUUID(),other])).rejects.toMatchObject({code:'23505'});
  const usedLease=(await db.query('SELECT lease_id FROM specialist_assignments WHERE id=$1',[assignment])).rows[0].lease_id;
  await expect(db.query(insert,[randomUUID(),1,attemptId,randomUUID(),'e'.repeat(64),randomUUID(),usedLease,other])).rejects.toMatchObject({code:'23505'});
  await expect(db.query('DELETE FROM specialist_discussions WHERE id=$1',[discussion])).rejects.toMatchObject({code:'42501'});
  await expect(fenceSpecialistCancellation({...actor,principalId:randomUUID()},conversation.id,discussion)).rejects.toMatchObject({status:404});
  expect(await fenceSpecialistCancellation(actor,conversation.id,discussion)).toMatchObject({discussionId:discussion,state:'stopping'});
  expect((await db.query('SELECT state FROM specialist_assignments WHERE discussion_id=$1 AND ordinal=2',[discussion])).rows[0].state).toBe('stopping');
  expect(await fenceSpecialistCancellation(actor,conversation.id,discussion)).toMatchObject({state:'stopping'});
  const {claimSpecialistControl}=await import('../../lib/server/research/specialists/discussion-maintenance');
  expect(await claimSpecialistControl()).toMatchObject({discussionId:discussion,attemptId});
  expect(await claimSpecialistControl()).toBeNull();
  expect((await db.query('SELECT state FROM specialist_discussions WHERE id=$1',[other])).rows[0].state).toBe('open');
  expect(Number((await db.query('SELECT control_attempts FROM specialist_discussions WHERE id=$1',[discussion])).rows[0].control_attempts)).toBe(1);
  const {turnFixture}=await import('../fixtures/eve-v27');
  const {emptySessionView,foldEvents}=await import('eve/events');
  const {projectSpecialistFact}=await import('../../lib/server/research/specialists/discussion-events');
  const firstCall=(await db.query('SELECT first_call_id FROM specialist_discussions WHERE id=$1',[discussion])).rows[0].first_call_id;
  const activeCall=(await db.query('SELECT call_id FROM specialist_assignments WHERE discussion_id=$1 AND ordinal=2',[discussion])).rows[0].call_id;
  const fixture=turnFixture().commit({type:'model.requested',scope:{turnId:'turn_0'},data:{runId:'fixture-run',owner:{turnId:'turn_0'}}})
   .commit({type:'call.requested',scope:{turnId:'turn_0'},data:{callId:firstCall,owner:{runId:'fixture-run'},capability:{kind:'tool',name:'implementation-research'},input:{}}},
    {type:'task.started',scope:{turnId:'turn_0'},data:{taskId:'fixture-task',startedBy:{callId:firstCall},kind:'tool',name:'implementation-research'}},
    {type:'call.started',scope:{turnId:'turn_0'},data:{callId:firstCall,taskId:'fixture-task'}},
    {type:'call.settled',scope:{turnId:'turn_0'},data:{callId:firstCall,outcome:'completed',output:null}},
    {type:'call.requested',scope:{turnId:'turn_0'},data:{callId:activeCall,owner:{runId:'fixture-run'},capability:{kind:'tool',name:'implementation-research'},input:{}}},
    {type:'call.started',scope:{turnId:'turn_0'},data:{callId:activeCall,taskId:'fixture-task'}})
   .commit({type:'call.settled',scope:{turnId:'turn_0'},data:{callId:activeCall,outcome:'completed',output:null}},
    {type:'task.ended',scope:{turnId:'turn_0'},data:{taskId:'fixture-task',outcome:'completed'}});
  const at=new Date().toISOString(),facts=fixture.events.map(event=>({...event,meta:{...event.meta,at}})),view=foldEvents(emptySessionView(),facts),last=facts.slice(-2);
  await projectSpecialistFact(native,last[0],last[0].meta.position,at,view);
  expect((await db.query('SELECT closed_at FROM specialist_discussions WHERE id=$1',[discussion])).rows[0].closed_at).toBeNull();
  await projectSpecialistFact(native,last[1],last[1].meta.position,at,view);
  const confirmed=(await db.query('SELECT state,terminal_line,terminal_index FROM specialist_assignments WHERE discussion_id=$1 AND ordinal=2',[discussion])).rows[0];
  expect(confirmed).toMatchObject({state:'cancelled',terminal_line:String(last[1].meta.position.line),terminal_index:last[1].meta.position.index});
  await projectSpecialistFact(native,last[0],last[0].meta.position,at,view);
  expect((await db.query('SELECT state FROM specialist_assignments WHERE discussion_id=$1 AND ordinal=2',[discussion])).rows[0].state).toBe('cancelled');

  const identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,responseAttemptId:attemptId};
  const prepared=await prepareResearch(identity,{accountId:customer,kind:'customer-update',workload:'platform',question:'Research this customer.'},new AbortController().signal,false,native);
  expect(prepared.status).toBe('research');
  const call={attemptId,principalId:actor.principalId,parentSessionId:native,workflowRunId:randomUUID(),callId:randomUUID(),kind:'customer-update' as const,message:'Research this customer.'};
  const admitted=await admitSpecialistCall(call);
  expect(admitted.duplicate).toBe(false);
  const locking=await Promise.all([1,2].map(()=>withTransaction(client=>lockOwnedDiscussion(client,actor,conversation.id,admitted.discussionId))));
  expect(locking.every(row=>row.id===admitted.discussionId)).toBe(true);
  const retries=await Promise.all([admitSpecialistCall(call),admitSpecialistCall(call)]);
  expect(retries.every(result=>result.duplicate&&result.assignmentId===admitted.assignmentId)).toBe(true);
  await withTransaction(client=>reserveOrdinaryOutput(client,conversation.id,attemptId,1));
  const charge={nativeStepKey:randomUUID(),model:'fixture/no-provider',ceiling:{inputTokens:100,outputTokens:100,microUsd:100},pricing:{fixture:true}};
  const reserve=()=>withTransaction(async client=>{
   await lockOwnedDiscussion(client,actor,conversation.id,admitted.discussionId);
   await client.query('SELECT id FROM specialist_assignments WHERE id=$1 FOR UPDATE',[admitted.assignmentId]);
   return reserveLockedSpecialistOperation(client,{discussionId:admitted.discussionId,assignmentId:admitted.assignmentId,conversationId:conversation.id},charge);
  });
  const operation=await reserve();
  await expect(reserve()).rejects.toMatchObject({status:409});
  await settleSpecialistOperation(operation.id,{inputTokens:5,outputTokens:8},{gateway:{}});
  expect((await db.query('SELECT actual_micro_usd FROM specialist_operations WHERE id=$1',[operation.id])).rows[0].actual_micro_usd).toBeNull();
  await settleSpecialistOperation(operation.id,{inputTokens:5,outputTokens:8},{gateway:{cost:'0.00005'}});
  await settleSpecialistOperation(operation.id,{inputTokens:1,outputTokens:1},{gateway:{cost:'0.000001'}});
  expect(Number((await db.query('SELECT actual_micro_usd FROM specialist_operations WHERE id=$1',[operation.id])).rows[0].actual_micro_usd)).toBe(50);
  let generations=0;const outputCaps:number[]=[];
  const fake=mockModel({provider:'owned-specialist-fixture',modelId:'fixture/no-provider',respond:()=>{generations++;return {text:'Synthetic specialist result.',usage:{inputTokens:5,outputTokens:8}};}});
  if(typeof fake==='string')throw Error('Unpaid fixture model required');
  const metered=wrapLanguageModel({model:fake,middleware:{async transformParams({params}){outputCaps.push(params.maxOutputTokens??0);return params;},async wrapGenerate({doGenerate}){const result=await doGenerate();return {...result,providerMetadata:{gateway:{cost:'0.000013'}}};}}});
  const runtime={attemptId,principalId:actor.principalId,parentSessionId:native,workerSessionId:'wrun_'+randomUUID(),kind:'customer-update' as const,turnId:'fixture-turn',stepIndex:0};
  const pricing=async()=>({input:0.000001,output:0.000001,observedAt:new Date().toISOString()});
  const provider=guardSpecialistProvider(metered,runtime,pricing);
  const parameters={prompt:[{role:'user' as const,content:[{type:'text' as const,text:'Refine this synthetic result.'}]}],maxOutputTokens:100};
  await provider.doGenerate(parameters);
  await expect(provider.doGenerate(parameters)).rejects.toMatchObject({status:409});
  await expect(guardSpecialistProvider(metered,runtime,pricing).doGenerate(parameters)).rejects.toMatchObject({status:409});
  const used=Number((await db.query('SELECT sum(actual_output_tokens) AS tokens FROM specialist_operations WHERE discussion_id=$1',[admitted.discussionId])).rows[0].tokens);
  await guardSpecialistProvider(metered,{...runtime,stepIndex:1},pricing).doGenerate({...parameters,maxOutputTokens:32000});
  expect(generations).toBe(2);expect(outputCaps.at(-1)).toBe(32000-used);
  const {enforceProfileRate}=await import('../../lib/server/profiles/rate');
  let throttled=false;
  for(let index=0;index<121;index++){try{await withTransaction(client=>enforceProfileRate(client,actor,customer,'read'));}catch(error){if((error as {status?:number}).status!==429)throw error;throttled=true;break;}}
  expect(throttled).toBe(true);
  const {loadResearchContext}=await import('../../lib/server/research/specialists/solution-research/context');
  await expect(loadResearchContext(identity,customer)).rejects.toMatchObject({status:429});
  const {authorizeSpecialistWorker}=await import('../../lib/server/research/specialists/discussions');
  expect((await withTransaction(client=>authorizeSpecialistWorker(client,runtime))).assignmentId).toBe(admitted.assignmentId);

  expect(await admitSpecialistCall(call)).toMatchObject({assignmentId:admitted.assignmentId,duplicate:true});
  await expect(admitSpecialistCall({...call,principalId:randomUUID()})).rejects.toMatchObject({status:404});
  await expect(admitSpecialistCall({...call,callId:randomUUID()})).rejects.toMatchObject({status:409});
  await expect(admitSpecialistCall({...call,message:'Conflicting replacement.'})).rejects.toMatchObject({status:409});
  const originalLease=(await db.query('SELECT lease_id FROM turas_research_requests WHERE key=$1',[prepared.key])).rows[0].lease_id;
  await db.query('UPDATE turas_research_requests SET lease_id=$2 WHERE key=$1',[prepared.key,randomUUID()]);
  await expect(admitSpecialistCall(call)).rejects.toMatchObject({status:409});
  await db.query('UPDATE turas_research_requests SET lease_id=$2,receipt=$3,completed_at=clock_timestamp(),lease_until=clock_timestamp() WHERE key=$1',[prepared.key,originalLease,JSON.stringify({fixture:'completed receipt metadata'})]);
  const reference={fixture:'opaque result identity'};
  await db.query("UPDATE specialist_assignments SET state='completed',result_reference=$2 WHERE id=$1",[admitted.assignmentId,JSON.stringify(reference)]);
  expect(await admitSpecialistCall(call)).toMatchObject({duplicate:true,state:'completed',resultReference:reference});
  await db.query('UPDATE specialist_discussions SET context_digest=$2 WHERE id=$1',[admitted.discussionId,'0'.repeat(64)]);
  await expect(admitSpecialistCall(call)).rejects.toMatchObject({status:409,code:'context_changed'});
  await db.query('RESET ROLE');
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[actor.sessionId]);
  await expect(admitSpecialistCall(call)).rejects.toMatchObject({status:404});
 }finally{await db.end();}
});
it('lets an owner stop work after customer access is revoked without reading customer context',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'partner','member'),customer=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Partner cancellation fixture',false)",[customer,actor.workspaceId]);
  await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,customer,actor.membershipId,actor.principalId]);
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query('INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now())',[process.env.TURAS_ENVIRONMENT_ID,'partner-specialist-'+key]);
  const {attemptId}=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Investigate the assigned account.');
  const discussion=randomUUID();
  await db.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,'solution','platform',$7,$8,$9,$10,$11,$12,$12,400000,32000,3000000,clock_timestamp()+interval '5 minutes')`,[discussion,conversation.id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,customer,native,randomUUID(),randomUUID(),attemptId,randomUUID(),'a'.repeat(64)]);
  await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1 AND customer_id=$2",[actor.membershipId,customer]);
  await expect(withTransaction(client=>lockOwnedDiscussion(client,actor,conversation.id,discussion))).rejects.toMatchObject({status:404});
  expect(await fenceSpecialistCancellation(actor,conversation.id,discussion)).toMatchObject({discussionId:discussion,state:'stopping'});
 }finally{await db.end();}
});
it('does not carry replaced, expired or tampered source snapshots into a refinement',async()=>{
 const {discussionSnapshotsCurrent}=await import('../../lib/server/research/specialists/discussion-sources');
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','admin'),customer=randomUUID(),fetchKey=randomUUID(),snapshotId=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Owned source freshness fixture',false)",[customer,actor.workspaceId]);
  const checkedAt=new Date(),refreshAfter=new Date(Date.now()+60000);
  const insert=`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,index_state) VALUES($1,$2,$3,$4,'https://example.org/owned-source','synthetic','{}',false,$5,$6,'ready')`;
  await db.query(insert,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,snapshotId,fetchKey,checkedAt,refreshAfter]);
  const identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  const source={kind:'snapshot' as const,snapshotId,checkedAt:checkedAt.toISOString(),refreshAfter:refreshAfter.toISOString()};
  const current=(reference=source)=>withTransaction(client=>discussionSnapshotsCurrent(client,identity,customer,[reference]));
  expect(await current()).toBe(true);
  expect(await current({...source,checkedAt:new Date(checkedAt.getTime()-1).toISOString()})).toBe(false);
  expect(await current({...source,refreshAfter:new Date(Date.now()-1).toISOString()})).toBe(false);
  await db.query(insert,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,randomUUID(),fetchKey,new Date(checkedAt.getTime()+1),refreshAfter]);
  expect(await current()).toBe(false);
 }finally{await db.end();}
});
it('authenticates only exact specialist cancellation paths while recovery is open or locked',async()=>{
 const {getCurrentSession,sessionCookieName}=await import('../../lib/server/auth/sessions');
 const {checkSessionCsrf,csrfTokenForSession}=await import('../../lib/server/auth/csrf');
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','admin'),conversation=randomUUID(),discussion=randomUUID();
  const paths=[`/api/conversations/${conversation}/specialists/${discussion}/cancel`,`/eve/v1/turas/specialists/${discussion}/cancel`];
  const origin=process.env.TURAS_APP_ORIGIN!;
  for(const mode of ['open','locked']){
   await db.query('UPDATE operations_control SET mode=$2 WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID,mode]);
   for(const path of paths){
    const request=new Request(origin+path,{method:'POST',headers:{origin,cookie:`${sessionCookieName()}=${actor.token}`,'x-csrf-token':csrfTokenForSession(actor.token)}});
    const current=await getCurrentSession(request,'cancellation');expect(current?.principalId).toBe(actor.principalId);
    expect(()=>checkSessionCsrf(request,current!)).not.toThrow();
    expect(()=>checkSessionCsrf(new Request(origin+path,{method:'POST',headers:{origin,cookie:request.headers.get('cookie')!,'x-csrf-token':'0'.repeat(64)}}),current!)).toThrow();
    expect(await getCurrentSession(new Request(origin+path+'/extra',{method:'POST',headers:request.headers}),'cancellation')).toBeNull();
    expect(await getCurrentSession(new Request(origin+path,{headers:request.headers}),'cancellation')).toBeNull();
   }
  }
 }finally{await db.query("UPDATE operations_control SET mode='open' WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);await db.end();}
});
it.each(['future-confirmation','existing-confirmed-recovery'] as const)('reconciles specialists only from exact confirmed parent retirement without refunding usage: %s',async mode=>{
 const {reconcileRetiredSpecialists}=await import('../../lib/server/research/specialists/discussion-retirement');
 const {requestOrdinaryNativeRetirement,confirmOrdinaryNativeRetirement}=await import('../../lib/server/conversations/native-retirement-recovery');
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','admin'),customer=randomUUID(),key=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Owned parent retirement account',false)",[customer,actor.workspaceId]);
  const {conversation}=await createOwnedConversation(actor,{requestKey:key,customerId:customer});
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query('INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now())',[process.env.TURAS_ENVIRONMENT_ID,'retirement-'+key]);
  const {attemptId}=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Owned retirement check.');await claimDispatch(actor,conversation.id,attemptId,0);
  await db.query('SET ROLE turas_runtime');
  const discussion=randomUUID(),done=randomUUID(),active=randomUUID();
  await db.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,'solution','platform',$7,$8,$9,$10,$11,$12,$12,400000,32000,3000000,clock_timestamp()+interval '5 minutes')`,[discussion,conversation.id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,customer,native,randomUUID(),randomUUID(),attemptId,randomUUID(),'a'.repeat(64)]);
  for(const [id,ordinal,state]of [[done,1,'completed'],[active,2,'stopping']]as const)await db.query(`INSERT INTO specialist_assignments(id,discussion_id,parent_session_id,ordinal,attempt_id,request_key,input_digest,call_id,research_key,lease_id,authority_expires_at,state,result_reference)
   SELECT $1,id,parent_session_id,$2,$3,$4,$5,$6,'fixture',$7,expires_at,$8,$9 FROM specialist_discussions WHERE id=$10`,[id,ordinal,attemptId,randomUUID(),'b'.repeat(64),randomUUID(),randomUUID(),state,state==='completed'?JSON.stringify({status:'completed',reference:'preserved'}):null,discussion]);
  await db.query(`INSERT INTO specialist_operations(id,discussion_id,assignment_id,native_step_key,model,ceiling_input_tokens,ceiling_output_tokens,ceiling_micro_usd,pricing)
   VALUES($1,$2,$3,$4,'fixture/no-provider',100,100,500,'{}')`,[randomUUID(),discussion,active,randomUUID()]);
  const finances=(await db.query('SELECT * FROM specialist_operations WHERE discussion_id=$1',[discussion])).rows;
  const completed=(await db.query('SELECT * FROM specialist_assignments WHERE id=$1',[done])).rows;
  expect(await withTransaction(client=>reconcileRetiredSpecialists(client,native,discussion))).toBe(false);
  await requestOrdinaryNativeRetirement(actor,native);
  await fenceSpecialistCancellation(actor,conversation.id,discussion);
  expect(await withTransaction(client=>reconcileRetiredSpecialists(client,native,discussion))).toBe(false);
  // A failing surrounding transaction must not leave either closure committed.
  await expect(withTransaction(async client=>{await client.query("UPDATE ordinary_native_retirements SET state='confirmed',confirmed_at=clock_timestamp() WHERE conversation_id=$1",[conversation.id]);expect(await reconcileRetiredSpecialists(client,native,discussion)).toBe(true);throw Error('Owned rollback');})).rejects.toThrow('Owned rollback');
  expect((await db.query('SELECT closed_at FROM specialist_discussions WHERE id=$1',[discussion])).rows[0].closed_at).toBeNull();
  if(mode==='future-confirmation')expect(await confirmOrdinaryNativeRetirement(native)).toBe(true);
  else{
   await db.query("UPDATE ordinary_native_retirements SET state='confirmed',confirmed_at=clock_timestamp() WHERE conversation_id=$1",[conversation.id]);
   const {reconcileSpecialistControl}=await import('../../lib/server/research/specialists/discussion-maintenance');
   const attach:Parameters<typeof reconcileSpecialistControl>[0]=()=>{throw Error('Confirmed parent must not redispatch native work');};
   expect(await reconcileSpecialistControl(attach,discussion,randomUUID())).toBe('retry');
   expect(await reconcileSpecialistControl(attach,discussion,attemptId)).toBe('settled');
  }
  expect(await withTransaction(client=>reconcileRetiredSpecialists(client,'wrun_foreign',discussion))).toBe(false);
  expect(await withTransaction(client=>reconcileRetiredSpecialists(client,native,randomUUID()))).toBe(false);
  const closed=(await db.query('SELECT state,close_reason,closed_at,version,projection_line,projection_fact_index FROM specialist_discussions WHERE id=$1',[discussion])).rows[0];
  expect(closed).toMatchObject({state:'closed',close_reason:'parent_retired',projection_line:'-1',projection_fact_index:-1});expect(closed.closed_at).toBeInstanceOf(Date);
  expect((await db.query('SELECT state,terminal_line,terminal_index FROM specialist_assignments WHERE id=$1',[active])).rows[0]).toEqual({state:'cancelled',terminal_line:null,terminal_index:null});
  expect(await withTransaction(client=>reconcileRetiredSpecialists(client,native,discussion))).toBe(true);
  expect((await db.query('SELECT state,close_reason,closed_at,version,projection_line,projection_fact_index FROM specialist_discussions WHERE id=$1',[discussion])).rows[0]).toEqual(closed);
  expect((await db.query('SELECT * FROM specialist_assignments WHERE id=$1',[done])).rows).toEqual(completed);
  expect((await db.query('SELECT * FROM specialist_operations WHERE discussion_id=$1',[discussion])).rows).toEqual(finances);
 }finally{await db.end();}
});
it('loads only an owned current best-practices result with its partial coverage and checked sources',async()=>{
 const {readOwnedPracticeResult}=await import('../../lib/server/research/specialists/practice-result');
 const {recordVercelPracticeRun}=await import('../../lib/server/research/specialists/research-cache/practice-library');
 const db=new Client({connectionString:url});await db.connect();
 try{
  const actor=await isolatedChatActor(db,'internal','admin'),customer=randomUUID(),key=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Owned practice result account',false)",[customer,actor.workspaceId]);
  const {conversation}=await createOwnedConversation(actor,{requestKey:key,customerId:customer});
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query('INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now())',[process.env.TURAS_ENVIRONMENT_ID,'practice-result-'+key]);
  const {attemptId}=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Owned practice result check.');await claimDispatch(actor,conversation.id,attemptId,0);
  await db.query('SET ROLE turas_runtime');
  const identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!},signal=new AbortController().signal,discussion=randomUUID();
  const checkedAt=new Date(),refreshAfter=new Date(Date.now()+60000),snapshotId=createHash('sha256').update(randomUUID()).digest('hex'),sourceUrl='https://vercel.com/docs/deployments';
  const source={id:'checked-doc',url:sourceUrl,title:'Checked deployment documentation',retrievedAt:checkedAt.toISOString(),excerpt:'Preserve the documented rollback requirements.'};
  await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,index_state)
   VALUES($1,$2,$3,$3,$4,'fixture',$5,false,$6,$7,'ready')`,[identity.environmentId,actor.workspaceId,snapshotId,sourceUrl,source,checkedAt,refreshAfter]);
  const brief={summary:'Bounded stored guidance with explicit incomplete coverage.',practices:[{practice:'Preserve a previously verified deployment.',rationale:'Keep an independently checked rollback target available.',sourceIds:[source.id],caveat:'The documented platform and plan prerequisites still apply.'}],gaps:['Plan-specific rollback availability remains unverified.']};
  const reference=await recordVercelPracticeRun(identity,'Next.js','Deployment safety',brief,[sourceUrl],signal);
  await db.query(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,workload,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,authority_digest,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at,dependencies)
   VALUES($1,$2,$3,$4,$5,$6,'best-practices','platform',$7,$8,$9,$10,$11,$12,$12,400000,28000,2000000,clock_timestamp()+interval '5 minutes',$13)`,[discussion,conversation.id,identity.environmentId,actor.workspaceId,actor.principalId,customer,native,randomUUID(),randomUUID(),attemptId,randomUUID(),'a'.repeat(64),JSON.stringify([{kind:'snapshot',snapshotId,checkedAt:checkedAt.toISOString(),refreshAfter:refreshAfter.toISOString()}])]);
  await db.query(`INSERT INTO specialist_assignments(id,discussion_id,parent_session_id,ordinal,attempt_id,request_key,input_digest,call_id,research_key,lease_id,authority_expires_at,state,result_reference)
   SELECT $1,id,parent_session_id,1,$2,$3,$4,$5,'fixture',$6,expires_at,'completed',$7 FROM specialist_discussions WHERE id=$8`,[randomUUID(),attemptId,randomUUID(),'b'.repeat(64),randomUUID(),randomUUID(),{kind:'best-practices',status:'incomplete',reference,reason:'Preserve checked gaps.'},discussion]);
  const read=()=>readOwnedPracticeResult(identity,native,reference,signal);
  const result=await read();expect(result.status).toBe('incomplete');expect(result.brief).toEqual(brief);expect(result.sources).toEqual([{id:source.id,url:sourceUrl,title:source.title,publishedAt:null,checkedAt:checkedAt.toISOString(),refreshAfter:refreshAfter.toISOString()}]);
  await expect(readOwnedPracticeResult(identity,'wrun_foreign',reference,signal)).rejects.toMatchObject({status:404});
  await expect(readOwnedPracticeResult({...identity,principalId:randomUUID()},native,reference,signal)).rejects.toMatchObject({status:404});
  await expect(readOwnedPracticeResult({...identity,workspaceId:randomUUID()},native,reference,signal)).rejects.toMatchObject({status:404});
  await expect(readOwnedPracticeResult({...identity,environmentId:'test-foreign'},native,reference,signal)).rejects.toMatchObject({status:404});
  await db.query("UPDATE specialist_discussions SET state='closed',closed_at=clock_timestamp() WHERE id=$1",[discussion]);expect((await read()).brief).toEqual(brief);
  await db.query("UPDATE turas_vercel_practice_runs SET brief=jsonb_set(brief,'{summary}','\"Tampered stored practice summary.\"') WHERE id=$1",[reference]);await expect(read()).rejects.toMatchObject({status:404});
  await db.query('UPDATE turas_vercel_practice_runs SET brief=$2 WHERE id=$1',[reference,brief]);
  await db.query("UPDATE turas_evidence_snapshots SET refresh_after=clock_timestamp()-interval '1 second' WHERE id=$1",[snapshotId]);await expect(read()).rejects.toMatchObject({status:404});
 }finally{await db.end();}
});
