import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {issueSession,getCurrentSession,sessionCookie} from '../../lib/server/auth/sessions';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch,deriveNativeAttempt} from '../../lib/server/conversations/dispatch';
import {projectNativeEvent} from '../../lib/server/conversations/projection';
import {prepareOrdinarySteering,recordSteeringReceipt,currentAttemptUserMessages} from '../../lib/server/conversations/steering';
import {wrapOrdinaryChatModel} from '../../lib/server/conversations/model-budget';
import {withTransaction} from '../../lib/server/db/client';
import {authorizeOwnedOrdinaryRetirement} from '../../lib/server/conversations/ordinary-retirement';
import {reserveOrdinaryOutput,settleOrdinaryOutput} from '../../lib/server/conversations/token-allowance';
import {requestOwnedTaskCancellation} from '../../lib/server/conversations/cancel';

const isolated=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(isolated);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.toString();process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
const event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()}});

it('keeps a late prior-turn cancellation attached to its original attempt and never reopens a stopped delivery',async()=>{
 const f=await fixture();try{
  await projectNativeEvent(f.native,f.attemptId,event('turn.completed',{turnId:f.turn}));
  const text='A second queued request';const next=await prepareAttempt(f.actor,f.conversation.id,f.native,randomUUID(),text);
  await claimDispatch(f.actor,f.conversation.id,next.attemptId,0);
  await requestOwnedTaskCancellation(f.actor,f.native);
  await projectNativeEvent(f.native,next.attemptId,event('turn.cancelled',{turnId:f.turn}));
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('stopping');
  const nextTurn='turn_'+randomUUID();await projectNativeEvent(f.native,next.attemptId,event('message.received',{turnId:nextTurn,message:text}));
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('stopping');
  await projectNativeEvent(f.native,next.attemptId,event('turn.cancelled',{turnId:nextTurn}));
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[next.attemptId])).rows[0].response_state).toBe('cancelled');
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

async function fixture(){
 const db=new Client({connectionString:isolated});await db.connect();
 const principalId=randomUUID(),membershipId=randomUUID(),workspaceId=randomUUID(),loginName='local-'+randomUUID();
 await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Disposable steering workspace')",[workspaceId]);
 await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Local steering user')",[principalId,loginName]);
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[membershipId,principalId,workspaceId]);
 const issued=await issueSession({principalId,membershipId,workspaceId,loginName,displayName:'Local steering user',kind:'internal',role:'member'});
 const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookie(issued.token,issued.expiresAt).split(';')[0]}}));
 if(!actor)throw Error('Local fixture login unavailable');
 const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});
 const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Local binding unavailable');
 const native='wrun_'+randomUUID(),turn='turn_'+randomUUID(),text='Explain the original technical question.';
 await bindNativeSession(actor,conversation.id,binding.claimToken,native);
 await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'steering-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
 const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),text);
 const dispatch=await claimDispatch(actor,conversation.id,attempt.attemptId,0);
 await projectNativeEvent(native,attempt.attemptId,event('message.received',{message:text,turnId:turn}));
 await db.query(`INSERT INTO general_context_injections(attempt_id,turn_id,snapshot_digest)
  SELECT attempt_id,$2,snapshot_digest FROM general_context_receipts WHERE attempt_id=$1`,[attempt.attemptId,turn]);
 const principal={principalId,attributes:{turasAttemptId:attempt.attemptId}};
 return {db,actor,conversation,native,turn,text,attemptId:attempt.attemptId,dispatch,principal};
}

it.each(['same','new'] as const)('keeps a %s-turn correction owner-bound, deduplicated and inside its original response window',async mode=>{
 const f=await fixture();try{
  expect((await withTransaction(db=>db.query('SELECT current_user AS role'))).rows[0].role).toBe('turas_runtime');
  const key=randomUUID(),text='Focus only on the documented Sandbox control limits.';
  const steering=await prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,text);
  if(steering?.kind!=='dispatch')throw Error('Expected a local correction dispatch');
  expect(steering.attemptId).toBe(f.attemptId);
  expect((await f.db.query('SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(1);
  expect(await withTransaction(db=>currentAttemptUserMessages(db,f.attemptId,f.actor.principalId,f.actor.workspaceId))).toEqual([expect.objectContaining({text:f.text})]);
  await expect(prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,text)).rejects.toMatchObject({code:'steering_unconfirmed'});
  await expect(prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,'Changed key body')).rejects.toMatchObject({code:'request_key_conflict'});
  await expect(prepareOrdinarySteering({...f.actor,principalId:randomUUID()},f.conversation.id,f.native,randomUUID(),text)).rejects.toMatchObject({status:404});
  expect(await deriveNativeAttempt(f.actor,f.native,key,text)).toBe(f.attemptId);
  await recordSteeringReceipt(steering.id,f.native,Response.json({ok:true,sessionId:f.native,status:'accepted',deliveryId:'local-delivery'},{status:202}));
  const duplicate=await prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,text);
  expect(duplicate?.kind).toBe('replay');if(duplicate?.kind==='replay')expect(await duplicate.response.json()).toMatchObject({deliveryId:'local-delivery'});
  await expect(prepareOrdinarySteering(f.actor,f.conversation.id,f.native,randomUUID(),text)).rejects.toMatchObject({code:'steering_pending'});
  // The first turn may finish after application admission but before native
  // consumes the correction. Its terminal event cannot strand that correction.
  await projectNativeEvent(f.native,f.attemptId,event('turn.completed',{turnId:f.turn}));
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0].response_state).toBe('running');
  const turn=mode==='same'?f.turn:'turn_'+randomUUID();
  await projectNativeEvent(f.native,f.attemptId,event('message.received',{message:text,turnId:turn}));
  const messages=await withTransaction(db=>currentAttemptUserMessages(db,f.attemptId,f.actor.principalId,f.actor.workspaceId));
  expect(messages[0].text).toBe(text);
  const original=(await f.db.query('SELECT native_turn_id,deadline_at FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0];
  expect(original.native_turn_id).toBe(f.turn);expect(original.deadline_at).toEqual(f.dispatch.deadlineAt);
  let calls=0;type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
  const provider={specificationVersion:'v4',provider:'local-fixture',modelId:'local-fixture',supportedUrls:{},async doGenerate(options:{abortSignal?:AbortSignal}){calls++;expect(options.abortSignal).toBeInstanceOf(AbortSignal);return {usage:{outputTokens:{total:7}}};},async doStream(){throw Error('Unused');}} as unknown as Model;
  const model=wrapOrdinaryChatModel(provider,f.principal,f.native,turn);await model.doGenerate({prompt:[]});
  await expect(model.doGenerate({prompt:[]})).rejects.toMatchObject({code:'model_call_repeated'});expect(calls).toBe(1);
  await projectNativeEvent(f.native,f.attemptId,event('message.completed',{turnId:turn,message:'A corrected, bounded answer.',finishReason:'stop'}));
  await projectNativeEvent(f.native,f.attemptId,event('turn.completed',{turnId:turn}));
  expect((await f.db.query('SELECT response_state,deadline_at FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0]).toMatchObject({response_state:'completed',deadline_at:f.dispatch.deadlineAt});
  expect(await prepareOrdinarySteering(f.actor,f.conversation.id,f.native,randomUUID(),'A genuinely new follow-up')).toBeNull();
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('settles a raced original completion only after an actual pre-admission rejection receipt',async()=>{
 const f=await fixture();try{
  const key=randomUUID(),text='A correction that the fixture runtime rejects';
  const steering=await prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,text);if(steering?.kind!=='dispatch')throw Error('Expected dispatch');
  await projectNativeEvent(f.native,f.attemptId,event('turn.completed',{turnId:f.turn}));
  await recordSteeringReceipt(steering.id,f.native,Response.json({ok:false,code:'session_not_ready'},{status:409}));
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0].response_state).toBe('completed');
  expect((await f.db.query('SELECT state FROM watchdog_jobs WHERE attempt_id=$1',[f.attemptId])).rows[0].state).toBe('settled');
  const retry=await prepareOrdinarySteering(f.actor,f.conversation.id,f.native,key,text);expect(retry?.kind).toBe('replay');if(retry?.kind==='replay')expect(retry.response.status).toBe(409);
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('keeps interrupted provider holds inside the existing 20,000-token conversation allowance',async()=>{
 const f=await fixture();try{
  let calls=0;type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
  const provider={specificationVersion:'v4',provider:'local-fixture',modelId:'local-fixture',supportedUrls:{},async doGenerate(){calls++;throw Error('Local interruption without usage');},async doStream(){throw Error('Unused');}} as unknown as Model;
  for(let i=0;i<3;i++)await expect(wrapOrdinaryChatModel(provider,f.principal,f.native,f.turn).doGenerate({prompt:[],maxOutputTokens:8192})).rejects.toThrow('Local interruption');
  await expect(wrapOrdinaryChatModel(provider,f.principal,f.native,f.turn).doGenerate({prompt:[],maxOutputTokens:8192})).rejects.toMatchObject({code:'conversation_budget'});
  expect(calls).toBe(3);
  const held=(await f.db.query('SELECT id,ceiling_tokens,actual_tokens FROM ordinary_model_operations WHERE conversation_id=$1 ORDER BY created_at,id',[f.conversation.id])).rows;
  expect(held.map(row=>row.ceiling_tokens)).toEqual([8192,8192,3616]);expect(held.every(row=>row.actual_tokens===null)).toBe(true);
  await settleOrdinaryOutput(held[0].id,{outputTokens:{total:10}});
  await settleOrdinaryOutput(held[0].id,{outputTokens:{total:10}});
  expect((await f.db.query('SELECT actual_tokens FROM ordinary_model_operations WHERE id=$1',[held[0].id])).rows[0].actual_tokens).toBe(10);
  const privilege=(await f.db.query("SELECT has_table_privilege('turas_runtime','ordinary_model_operations','DELETE') AS can_delete,has_column_privilege('turas_runtime','ordinary_model_operations','ceiling_tokens','UPDATE') AS can_reset")).rows[0];
  expect(privilege).toEqual({can_delete:false,can_reset:false});
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('serializes concurrent provider reservations without overspending the conversation allowance',async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled(Array.from({length:4},()=>withTransaction(db=>reserveOrdinaryOutput(db,f.conversation.id,f.attemptId,8192))));
  const admitted=results.filter(result=>result.status==='fulfilled');
  const rejected=results.filter(result=>result.status==='rejected');
  expect(admitted).toHaveLength(3);expect(rejected).toHaveLength(1);
  expect(rejected[0]).toMatchObject({reason:{code:'conversation_budget'}});
  expect(admitted.reduce((sum,result)=>sum+result.value.ceiling,0)).toBe(20000);
  const held=(await f.db.query('SELECT sum(ceiling_tokens)::int AS tokens,count(*)::int AS operations FROM ordinary_model_operations WHERE conversation_id=$1',[f.conversation.id])).rows[0];
  expect(held).toEqual({tokens:20000,operations:3});
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('blocks provider I/O and new corrections after cancellation starts',async()=>{
 const f=await fixture();try{
  await f.db.query("UPDATE response_attempts SET response_state='stopping' WHERE id=$1",[f.attemptId]);
  let calls=0;type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
  const provider={specificationVersion:'v4',provider:'local-fixture',modelId:'local-fixture',supportedUrls:{},async doGenerate(){calls++;return {usage:{outputTokens:{total:1}}};},async doStream(){throw Error('Unused');}} as unknown as Model;
  await expect(wrapOrdinaryChatModel(provider,f.principal,f.native,f.turn).doGenerate({prompt:[]})).rejects.toMatchObject({status:404});
  expect(calls).toBe(0);
  await expect(prepareOrdinarySteering(f.actor,f.conversation.id,f.native,randomUUID(),'A late correction')).rejects.toBeDefined();
  expect((await f.db.query('SELECT count(*)::int AS n FROM ordinary_model_operations WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(0);
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('requires the current owner and CSRF before closing ordinary admission for native retirement',async()=>{
 const f=await fixture();try{
  const {issueSession,sessionCookie}=await import('../../lib/server/auth/sessions');
  const issued=await issueSession({principalId:f.actor.principalId,membershipId:f.actor.membershipId,workspaceId:f.actor.workspaceId,loginName:f.actor.loginName,displayName:f.actor.displayName,kind:f.actor.kind,role:f.actor.role});
  const cookie=sessionCookie(issued.token,issued.expiresAt).split(';')[0],origin=process.env.TURAS_APP_ORIGIN!;
  const session=await getCurrentSession(new Request(origin,{headers:{cookie}}));if(!session)throw Error('Local retirement login unavailable');
  const request=(csrf?:string)=>new Request(origin+'/eve/v1/session/'+f.native+'/reset',{method:'POST',headers:{origin,cookie,...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify({reason:'Disposable owned retirement check'})});
  await expect(authorizeOwnedOrdinaryRetirement(request(),f.native)).rejects.toMatchObject({status:403});
  const {csrfTokenForSession}=await import('../../lib/server/auth/csrf');
  const csrf=csrfTokenForSession(session.token);
  await expect(authorizeOwnedOrdinaryRetirement(request(csrf),'wrun_unowned')).rejects.toMatchObject({status:404});
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0].response_state).toBe('running');
  expect(await authorizeOwnedOrdinaryRetirement(request(csrf),f.native)).toBe(f.actor.principalId);
  expect((await f.db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.attemptId])).rows[0].response_state).toBe('stopping');
 }finally{try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});

it('aborts a bounded file-check conversation at its operator deadline and refuses further provider I/O',async()=>{
 const f=await fixture(),keys=['TURAS_ORDINARY_NATIVE_FILES_ENABLED','TURAS_ORDINARY_NATIVE_FILES_CONVERSATION_ID','TURAS_ORDINARY_NATIVE_FILES_EXPIRES_AT'] as const;
 const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';process.env.TURAS_ORDINARY_NATIVE_FILES_CONVERSATION_ID=f.conversation.id;
  process.env.TURAS_ORDINARY_NATIVE_FILES_EXPIRES_AT=new Date(Date.now()+1000).toISOString();
  let calls=0;type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
  const provider={specificationVersion:'v4',provider:'local-fixture',modelId:'local-fixture',supportedUrls:{},async doGenerate(options:{abortSignal?:AbortSignal}){
   calls++;const signal=options.abortSignal;if(!signal)throw Error('Operator deadline signal missing');
   return new Promise((_,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Owned check expired','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);reject(Error('Provider outlived operator deadline'));},2500);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  },async doStream(){throw Error('Unused');}} as unknown as Model;
  await expect(wrapOrdinaryChatModel(provider,f.principal,f.native,f.turn).doGenerate({prompt:[]})).rejects.toMatchObject({name:'AbortError'});
  await expect(wrapOrdinaryChatModel(provider,f.principal,f.native,f.turn).doGenerate({prompt:[]})).rejects.toMatchObject({status:503,code:'native_files_unavailable'});
  expect(calls).toBe(1);
 }finally{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}try{await settleSyntheticConversationAttempts(f.db,[f.conversation.id]);}finally{await f.db.end();}}
});
