import {getOwnedConversationDetail} from '../../lib/server/conversations/repository';
import {assertNativeContextCurrent} from '../../lib/server/conversations/context-fence';
import {retireRetrievalProjection} from '../../lib/server/retrieval/projections';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {ownedInputResponseAttempt,authorizeOwnedInputResponse} from "../../lib/server/conversations/input-responses";
import {refreshOrdinaryKnowledge} from '../../lib/server/conversations/current-knowledge';
import {createHash,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {withTransaction} from '../../lib/server/db/client';
import {createOwnedConversation,getOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {projectNativeEvent} from '../../lib/server/conversations/projection';
import {resolveCustomerAccount,readCustomerAccountEvidence} from '../../lib/server/conversations/customer-accounts';
import {readCurrentAttemptContext} from '../../lib/server/profiles/attempt-context';
import {boundToolActor} from '../../lib/server/profiles/tool-actor';
import {requestOwnedTaskCancellation,settleInactiveOwnedCancellation} from '../../lib/server/conversations/cancel';
import {wrapOrdinaryChatModel} from '../../lib/server/conversations/model-budget';
const isolatedTestUrl=requireTestDatabaseUrl();
const ownedConversationIds:string[]=[];
beforeAll(()=>{const runtime=new URL(isolatedTestUrl);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.toString();process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
let priorActor:CurrentSession|undefined;
async function signIn():Promise<CurrentSession>{const db=new Client({connectionString:isolatedTestUrl});await db.connect();try{priorActor=await isolatedChatActor(db,'partner','member',undefined,priorActor);return priorActor;}finally{await db.end();}}
it('uses customer selection as initial context, continues after new knowledge and login, and protects previously read customer access',async()=>{
 const db=new Client({connectionString:isolatedTestUrl});await db.connect();try{
  const original=await signIn(),a=randomUUID(),b=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$3,'Live fixture A',false),($2,$3,'Live fixture B',false)",[a,b,original.workspaceId]);
  for(const customer of [a,b])await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),original.workspaceId,customer,original.membershipId,original.principalId]);
  const key=randomUUID(),{conversation}=await createOwnedConversation(original,{requestKey:key,customerId:a});
  ownedConversationIds.push(conversation.id);
  const binding=await claimBinding(original,conversation.id,key);if(binding.state!=='claimed')throw Error('Fixture binding unavailable');
  const native=`wrun_${randomUUID()}`;await bindNativeSession(original,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'live-chat-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const text='Which products does Live fixture B use?',attempt=await prepareAttempt(original,conversation.id,native,randomUUID(),text);await claimDispatch(original,conversation.id,attempt.attemptId,0);
  const principal={principalId:original.principalId,attributes:{turasAttemptId:attempt.attemptId}};
  expect(await withTransaction(client=>readCurrentAttemptContext(client,attempt.attemptId,original.principalId))).toMatchObject({contractVersion:'general-context-v1'});
  expect(await withTransaction(client=>resolveCustomerAccount(client,principal,'Live fixture B'))).toMatchObject({status:'resolved',account:{id:b}});
  expect(await withTransaction(client=>readCustomerAccountEvidence(client,principal,b))).toMatchObject({customer:{id:b}});
  expect(await withTransaction(client=>boundToolActor(client,principal))).toMatchObject({customerId:a});
  const refreshed=await withTransaction(client=>refreshOrdinaryKnowledge(client,original,principal,conversation.id,attempt.attemptId));
  expect(refreshed).toMatchObject({contractVersion:'ordinary-current-knowledge-v1',contexts:expect.arrayContaining([expect.objectContaining({customer:expect.objectContaining({id:b})})])});
  expect((await db.query('SELECT count(*)::int AS count FROM ordinary_context_refreshes WHERE attempt_id=$1',[attempt.attemptId])).rows[0].count).toBe(1);
  const turn=`turn_${randomUUID()}`,event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()}});
  await projectNativeEvent(native,attempt.attemptId,event('message.received',{message:text,turnId:turn}));await projectNativeEvent(native,attempt.attemptId,event('turn.completed',{turnId:turn}));
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[original.sessionId]);
  await db.query("UPDATE conversations SET context_valid_until=now()-interval '1 hour' WHERE id=$1",[conversation.id]);
  await db.query('UPDATE customer_profile_state SET version=version+1,internal_generation=internal_generation+1,delivery_generation=delivery_generation+1 WHERE customer_id=$1',[a]);
  let fresh=await signIn();expect(fresh.sessionId).not.toBe(original.sessionId);
  expect(await getOwnedConversation(fresh,conversation.id)).toMatchObject({contextStatus:'current'});
  const next=await prepareAttempt(fresh,conversation.id,native,randomUUID(),'What is current now?');await claimDispatch(fresh,conversation.id,next.attemptId,2);
  expect(await withTransaction(client=>readCurrentAttemptContext(client,next.attemptId,fresh.principalId))).toMatchObject({contractVersion:'general-context-v1'});
  const nextTurn=`turn_${randomUUID()}`,requestId=`request_${randomUUID()}`;
  await projectNativeEvent(native,next.attemptId,event('message.received',{message:'What is current now?',turnId:nextTurn}));
  await projectNativeEvent(native,next.attemptId,event('input.requested',{turnId:nextTurn,requests:[{requestId,kind:'question',prompt:'Which workload?',allowFreeform:true,action:{kind:'tool-call',callId:'fixture-question',toolName:'ask_question',input:{question:'Which workload?'}}}]}));
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('waiting_input');
  expect((await db.query('SELECT state FROM watchdog_jobs WHERE attempt_id=$1',[next.attemptId])).rows[0].state).toBe('settled');
  await projectNativeEvent(native,next.attemptId,event('turn.completed',{turnId:''}));
  await projectNativeEvent(native,next.attemptId,event('turn.completed',{turnId:'native-limit-control-turn'}));
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('waiting_input');
  await expect(projectNativeEvent(native,next.attemptId,event('message.appended',{turnId:'',messageDelta:'Unadmitted answer'}))).rejects.toThrow('Native turn does not match');
  expect(await ownedInputResponseAttempt(fresh,native,{inputResponses:[{requestId,text:'The public site'}]})).toBe(next.attemptId);
  await expect(ownedInputResponseAttempt({...fresh,principalId:randomUUID()},native,{inputResponses:[{requestId,text:'The public site'}]})).rejects.toMatchObject({status:409});
  const unrelated=await prepareAttempt(fresh,conversation.id,native,randomUUID(),'An unrelated follow-up');await claimDispatch(fresh,conversation.id,unrelated.attemptId,4);
  const unrelatedTurn=`turn_${randomUUID()}`;
  await projectNativeEvent(native,unrelated.attemptId,event('message.received',{message:'An unrelated follow-up',turnId:unrelatedTurn}));
  await projectNativeEvent(native,unrelated.attemptId,event('turn.completed',{turnId:unrelatedTurn}));
  const originalAuthoritySession=fresh.sessionId;
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[fresh.sessionId]);
  fresh=await signIn();
  let providerCalls=0;let providerSignal:AbortSignal|undefined;
  type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
  const provider={specificationVersion:'v4',provider:'local-admission-fixture',modelId:'local-fixture',supportedUrls:{},
    async doGenerate(options:{abortSignal?:AbortSignal}){providerCalls++;providerSignal=options.abortSignal;return {};},
    async doStream(){throw Error('Unused fixture stream');}} as unknown as Model;
  const resumedPrincipal={principalId:fresh.principalId,attributes:{turasAttemptId:next.attemptId}};
  const resumedModel=()=>wrapOrdinaryChatModel(provider,resumedPrincipal,native,'');
  await expect(resumedModel().doGenerate({prompt:[]})).rejects.toMatchObject({status:404});
  expect(providerCalls).toBe(0);
  await authorizeOwnedInputResponse(fresh,native,{inputResponses:[{requestId,text:'The public site'}]});
  await expect(projectNativeEvent(native,next.attemptId,event('turn.completed',{turnId:'native-limit-control-turn'}))).rejects.toThrow('Native turn does not match');
  const posted=(await db.query('SELECT deadline_at FROM native_input_resume_windows WHERE attempt_id=$1',[next.attemptId])).rows[0].deadline_at;
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('running');
  await authorizeOwnedInputResponse(fresh,native,{inputResponses:[{requestId,text:'The public site'}]});
  expect((await db.query('SELECT deadline_at FROM native_input_resume_windows WHERE attempt_id=$1',[next.attemptId])).rows[0].deadline_at).toEqual(posted);
  await projectNativeEvent(native,next.attemptId,event('turn.completed',{turnId:nextTurn}));
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('running');
  await projectNativeEvent(native,next.attemptId,event('message.appended',{turnId:'',messageDelta:'Resumed'}));
  await expect(resumedModel().doGenerate({prompt:[]})).rejects.toMatchObject({status:404});
  expect(providerCalls).toBe(0);
  await db.query(`INSERT INTO general_context_injections(attempt_id,turn_id,snapshot_digest)
    SELECT attempt_id,$2,snapshot_digest FROM general_context_receipts WHERE attempt_id=$1`,[next.attemptId,nextTurn]);
  await resumedModel().doGenerate({prompt:[]});
  expect(providerCalls).toBe(1);expect(providerSignal).toBeInstanceOf(AbortSignal);
  expect((await db.query('SELECT login_session_id FROM general_context_receipts WHERE attempt_id=$1',[next.attemptId])).rows[0].login_session_id).toBe(originalAuthoritySession);
  expect((await db.query('SELECT login_session_id FROM ordinary_chat_authorities WHERE attempt_id=$1',[next.attemptId])).rows[0].login_session_id).toBe(fresh.sessionId);
  expect(await withTransaction(client=>readCurrentAttemptContext(client,next.attemptId,fresh.principalId))).toMatchObject({contractVersion:'general-context-v1'});
  await projectNativeEvent(native,unrelated.attemptId,event('input.resolved',{turnId:'resumed-native-turn',resolutions:[{requestId,kind:'question',outcome:'answered',response:{requestId,text:'The public site'}}]}));
  expect((await db.query('SELECT DISTINCT deadline_at FROM native_input_resume_windows WHERE attempt_id=$1',[next.attemptId])).rows).toEqual([{deadline_at:posted}]);
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('running');
  await expect(ownedInputResponseAttempt(fresh,native,{inputResponses:[{requestId,text:'Again'}]})).rejects.toMatchObject({status:409});
  await projectNativeEvent(native,next.attemptId,event('message.completed',{turnId:'resumed-native-turn',message:'Resumed answer',finishReason:'stop'}));
  await projectNativeEvent(native,next.attemptId,event('turn.completed',{turnId:'resumed-native-turn'}));
  const cancelled=await prepareAttempt(fresh,conversation.id,native,randomUUID(),'A response cancelled before native execution');
  await claimDispatch(fresh,conversation.id,cancelled.attemptId,8);
  await settleInactiveOwnedCancellation(fresh,native);
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[cancelled.attemptId])).rows[0].response_state).toBe('pending');
  await requestOwnedTaskCancellation(fresh,native);
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[cancelled.attemptId])).rows[0].response_state).toBe('stopping');
  await settleInactiveOwnedCancellation(fresh,native);
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[cancelled.attemptId])).rows[0].response_state).toBe('cancelled');
  expect((await db.query('SELECT state FROM watchdog_jobs WHERE attempt_id=$1',[cancelled.attemptId])).rows[0].state).toBe('settled');
  // Named reads have no retrieval dependency: retain exact consumed IDs across
  // ordinary refreshes and historical turns, and recheck them on every release.
  const reviewer=await isolatedChatActor(db,'internal','admin',fresh.workspaceId);
  async function acceptedNamedFact(label:string){
    const recordId=randomUUID(),revisionId=randomUUID(),body='Synthetic '+label+' has an assigned owner.';
    await db.query(`INSERT INTO profile_records(id,workspace_id,customer_id,kind,canonical_key,created_by)
      VALUES($1,$2,$3,'product_use',$4,$5)`,[recordId,fresh.workspaceId,b,'withdrawal-'+recordId,fresh.membershipId]);
    await db.query(`INSERT INTO profile_revisions(id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
      VALUES($1,$2,$3,$4,1,'profile-v1',$5,$6,$7,'manual','delivery','delivery_context',$8)`,
    [revisionId,recordId,fresh.workspaceId,b,JSON.stringify({kind:'product_use',productKey:recordId,displayName:label,state:'actual',usageDescription:body,observedAt:new Date().toISOString(),evidenceRevisionIds:[]}),
      JSON.stringify({rubricVersion:'evidence-quality-v1',R:4,D:4,C:0,reliabilityRationale:'Synthetic direct observation',directnessRationale:'Exact fixture statement',corroborationRationale:'No independent corroboration',informationType:'account_status',dateBasis:'observation'}),fresh.membershipId,createHash('sha256').update(body).digest('hex')]);
    await db.query(`INSERT INTO profile_review_decisions(revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
      VALUES($1,'accept',$2,'Synthetic source review',$3)`,[revisionId,reviewer.membershipId,randomUUID()]);
    await db.query('UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1',[recordId,revisionId]);
    return{recordId,revisionId};
  }
  const consumed=await acceptedNamedFact('release readiness');
  const normalKey=randomUUID(),normal=await createOwnedConversation(fresh,{requestKey:normalKey,customerId:b});ownedConversationIds.push(normal.conversation.id);
  const normalBinding=await claimBinding(fresh,normal.conversation.id,normalKey);if(normalBinding.state!=='claimed')throw Error('Normal source fixture binding unavailable');
  const normalNative=`wrun_${randomUUID()}`;await bindNativeSession(fresh,normal.conversation.id,normalBinding.claimToken,normalNative);
  const normalAttempt=await prepareAttempt(fresh,normal.conversation.id,normalNative,randomUUID(),'Read the accepted release readiness fact');await claimDispatch(fresh,normal.conversation.id,normalAttempt.attemptId,0);
  const normalPrincipal={principalId:fresh.principalId,attributes:{turasAttemptId:normalAttempt.attemptId}};
  await withTransaction(client=>readCustomerAccountEvidence(client,normalPrincipal,b));
  const namedIds=async()=>((await db.query('SELECT citation_ids FROM general_customer_read_scopes WHERE attempt_id=$1 AND customer_id=$2',[normalAttempt.attemptId,b])).rows[0].citation_ids as string[]);
  expect((await db.query('SELECT citation_id FROM ordinary_named_content_dependencies WHERE first_attempt_id=$1',[normalAttempt.attemptId])).rows.map(row=>row.citation_id)).toContain('accepted_manual:'+consumed.revisionId);
  await acceptedNamedFact('independent deployment inventory');
  await withTransaction(client=>readCustomerAccountEvidence(client,normalPrincipal,b));
  await withTransaction(client=>refreshOrdinaryKnowledge(client,fresh,normalPrincipal,normal.conversation.id,normalAttempt.attemptId));
  expect((await db.query('SELECT citation_id FROM ordinary_named_content_dependencies WHERE first_attempt_id=$1',[normalAttempt.attemptId])).rows.map(row=>row.citation_id)).toContain('accepted_manual:'+consumed.revisionId);
  expect(await getOwnedConversationDetail(fresh,normal.conversation.id)).toMatchObject({contextStatus:'current'});
  expect((await db.query('SELECT count(*)::int AS n FROM session_evidence_dependencies WHERE conversation_id=$1',[normal.conversation.id])).rows[0].n).toBe(0);
  await settleSyntheticConversationAttempts(db,[normal.conversation.id]);
  const later=await prepareAttempt(fresh,normal.conversation.id,normalNative,randomUUID(),'A later independent question');await claimDispatch(fresh,normal.conversation.id,later.attemptId,2);
  await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
    VALUES($1,$2,'delivery',(SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$2),'{}')`,[later.attemptId,b]);
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[consumed.recordId]);
  await withTransaction(client=>retireRetrievalProjection(client,'accepted_profile',consumed.revisionId));
  await expect(getOwnedConversationDetail(fresh,normal.conversation.id)).rejects.toMatchObject({status:404});
  await expect(assertNativeContextCurrent(fresh,normalNative,false)).rejects.toMatchObject({status:404});
  await expect(prepareAttempt(fresh,normal.conversation.id,normalNative,randomUUID(),'Continue the withdrawn content')).rejects.toMatchObject({status:404});
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[b,fresh.membershipId]);
  await expect(getOwnedConversation(fresh,conversation.id)).rejects.toMatchObject({status:404});
 }finally{try{await settleSyntheticConversationAttempts(db,ownedConversationIds);}finally{await db.end();}}
});
