import {createArtifactDatabaseFixture} from '../fixtures/artifact-database';
import {createProfileTestSession} from '../fixtures/profiles';
import {DEMO_IDS} from '../fixtures/identities';
import {attachConversationArtifact} from '../../lib/server/artifacts/references';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it,vi} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {createOwnedConversation,getOwnedConversationDetail} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch,recordNativeReceipt} from '../../lib/server/conversations/dispatch';
import {projectNativeEvent,type NativeEvent} from '../../lib/server/conversations/projection';
import {reconcileFromEvents} from '../../lib/server/conversations/reconcile';
import {savedNativeInputReplay} from '../../lib/server/conversations/native-input-replay';
import {withTransaction,getRuntimePool} from '../../lib/server/db/client';
import {reserveOrdinaryOutput} from '../../lib/server/conversations/token-allowance';
const url=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(url);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
async function fixture(db:Client,expired=false,parts?:Record<string,unknown>[],receiptFirst=true){
 const actor=await isolatedChatActor(db,'internal','admin'),key=randomUUID();
 const {conversation}=await createOwnedConversation(actor,{requestKey:key});
 const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding not claimed');
 const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
 await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID,'replay-'+key]);
 const text='Exact original native input.',prepared=await prepareAttempt(actor,conversation.id,native,randomUUID(),text);
 if(expired){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()-121000);}
 try{await claimDispatch(actor,conversation.id,prepared.attemptId,0);}finally{if(expired)vi.useRealTimers();}
 const delivery=randomUUID();if(receiptFirst)await recordNativeReceipt(actor,conversation.id,prepared.attemptId,Response.json({deliveryId:delivery,status:'accepted'},{status:202}));
 const event=(overrides:Partial<NativeEvent>={}):NativeEvent=>({type:'message.received',data:{message:text,turnId:'turn_0',sequence:0,...(parts?{parts}:{})},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString(),deliveryIds:[delivery]},...overrides});
 const first=event();await projectNativeEvent(native,prepared.attemptId,first);
 const initial=(await db.query('SELECT input_event_id,deadline_at,input_digest,output_tokens FROM response_attempts WHERE id=$1',[prepared.attemptId])).rows[0];
 return {actor,id:conversation.id,native,attempt:prepared.attemptId,delivery,text,event,first,initial};
}
async function owned(run:(db:Client,ids:string[])=>Promise<void>){const db=new Client({connectionString:url});await db.connect();const ids:string[]=[];try{await run(db,ids);}finally{try{await settleSyntheticConversationAttempts(db,ids);}finally{await db.end();}}}
it('records at most three exact interrupted-delivery aliases without changing canonical input, deadline, allowance or rendered send',()=>owned(async(db,ids)=>{
 const f=await fixture(db);ids.push(f.id);const aliases:NativeEvent[]=[];
 for(let i=0;i<3;i++){const event=f.event();await projectNativeEvent(f.native,f.attempt,event);aliases.push(event);}
 await expect(projectNativeEvent(f.native,f.attempt,f.event())).rejects.toThrow();
 const rows=(await db.query("SELECT visible_payload FROM event_projections WHERE conversation_id=$1 AND event_type='message.received'",[f.id])).rows;
 expect(rows).toHaveLength(4);expect(rows.filter(row=>row.visible_payload.applicationInputReplay)).toHaveLength(3);
 expect((await db.query('SELECT input_event_id,deadline_at,input_digest,output_tokens FROM response_attempts WHERE id=$1',[f.attempt])).rows[0]).toEqual(f.initial);
 expect(Number((await db.query('SELECT count(*) FROM ordinary_model_operations WHERE attempt_id=$1',[f.attempt])).rows[0].count)).toBe(0);
 const detail=await getOwnedConversationDetail(f.actor,f.id);expect(detail.history.filter(event=>event.eventType==='message.received')).toHaveLength(1);
 // Already admitted exact aliases reconcile after a provider hold exists; new ones cannot.
 await withTransaction(client=>reserveOrdinaryOutput(client,f.id,f.attempt,1));
 expect(await withTransaction(client=>savedNativeInputReplay(client,f.id,f.native,f.first.meta.id!,aliases[0]))).toBe(true);
 expect(await withTransaction(client=>savedNativeInputReplay(client,f.id,f.native,f.first.meta.id!,f.event()))).toBe(false);
 const terminal:NativeEvent={type:'turn.completed',data:{turnId:'turn_0',sequence:0},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}};
 const stream=[f.first,...aliases,terminal].map((event,index)=>({index,event}));
 expect(await reconcileFromEvents(f.native,f.attempt,stream)).toEqual({state:'reconciled',nextIndex:5});
 expect(await reconcileFromEvents(f.native,f.attempt,stream)).toEqual({state:'reconciled',nextIndex:5});
 expect((await db.query('SELECT input_event_id,deadline_at,input_digest,output_tokens FROM response_attempts WHERE id=$1',[f.attempt])).rows[0]).toEqual(f.initial);
 expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[f.attempt])).rows[0].response_state).toBe('completed');
 expect((await getOwnedConversationDetail(f.actor,f.id)).history.filter(event=>event.eventType==='message.received')).toHaveLength(1);
 expect((await db.query('SELECT ceiling_tokens,actual_tokens,settled_at FROM ordinary_model_operations WHERE attempt_id=$1',[f.attempt])).rows).toEqual([{ceiling_tokens:1,actual_tokens:null,settled_at:null}]);
}));
it('refuses changed or absent delivery, turn, sequence, text, expired deadlines, wrong native and revoked exact owner authority',()=>owned(async(db,ids)=>{
 const f=await fixture(db);ids.push(f.id);
 for(const change of [
  {meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}},
  {meta:{id:'evt_'+randomUUID(),at:new Date().toISOString(),deliveryIds:[randomUUID()]}},
  {meta:{id:'evt_'+randomUUID(),at:new Date().toISOString(),deliveryIds:[f.delivery,f.delivery]}},
  {data:{message:f.text,turnId:'turn_1',sequence:0}},
  {data:{message:f.text,turnId:'turn_0',sequence:1}},
  {data:{message:f.text,turnId:'turn_0'}},
  {data:{message:'Changed original',turnId:'turn_0',sequence:0}},
 ])await expect(projectNativeEvent(f.native,f.attempt,f.event(change))).rejects.toThrow();
 await expect(projectNativeEvent('wrun_'+randomUUID(),f.attempt,f.event())).rejects.toThrow();
 const expired=await fixture(db,true);ids.push(expired.id);
 await expect(projectNativeEvent(expired.native,expired.attempt,expired.event())).rejects.toThrow();
 const g=await fixture(db);ids.push(g.id);
 await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[g.actor.sessionId]);
 await expect(projectNativeEvent(g.native,g.attempt,g.event())).rejects.toThrow();
}));
it('serializes with provider reservation and refuses any prior operation including an explicitly settled zero-token operation',()=>owned(async(db,ids)=>{
 const f=await fixture(db);ids.push(f.id);
 const reserving=await getRuntimePool().connect();
 try{
  await reserving.query('BEGIN');await reserving.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[f.id]);
  let settled=false;const replay=projectNativeEvent(f.native,f.attempt,f.event()).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
  // A separate server transaction cannot admit an alias while the provider lock is held.
  await new Promise(resolve=>setTimeout(resolve,80));expect(settled).toBe(false);
  const operation=await reserveOrdinaryOutput(reserving,f.id,f.attempt,1);await reserving.query('COMMIT');
  expect(await replay).toBeInstanceOf(Error);
  await db.query('UPDATE ordinary_model_operations SET actual_tokens=0,settled_at=clock_timestamp() WHERE id=$1',[operation.id]);
  await expect(projectNativeEvent(f.native,f.attempt,f.event())).rejects.toThrow();
  expect((await db.query('SELECT input_event_id,deadline_at,input_digest,output_tokens FROM response_attempts WHERE id=$1',[f.attempt])).rows[0]).toEqual(f.initial);
 }finally{await reserving.query('ROLLBACK').catch(()=>{});reserving.release();}
}));

it('binds the complete sanitized attachment envelope while allowing changed private transport URLs',()=>owned(async(db,ids)=>{
 const parts=[{type:'text',text:'Exact original native input.'},{type:'file',filename:'source.bin',mediaType:'application/octet-stream',size:27,url:'https://initial.invalid/private',data:'private'}];
 const f=await fixture(db,false,parts);ids.push(f.id);
 for(const changed of [[],[parts[0]], [...parts,{type:'file',filename:'added.bin',mediaType:'application/octet-stream',size:1}],
  [parts[0],{...parts[1],filename:'changed.bin'}],[parts[0],{...parts[1],mediaType:'text/plain'}],
  [parts[0],{...parts[1],size:28}],[{type:'text',text:'Changed envelope text'},parts[1]]]){
  await expect(projectNativeEvent(f.native,f.attempt,f.event({data:{message:f.text,turnId:'turn_0',sequence:0,parts:changed}}))).rejects.toThrow();
 }
 const retry=f.event({data:{message:f.text,turnId:'turn_0',sequence:0,parts:[parts[0],{...parts[1],url:'https://retry.invalid/private',data:'changed private representation'}]}});
 await projectNativeEvent(f.native,f.attempt,retry);
 expect(await withTransaction(client=>savedNativeInputReplay(client,f.id,f.native,f.first.meta.id!,retry))).toBe(true);
 expect(await withTransaction(client=>savedNativeInputReplay(client,f.id,f.native,f.first.meta.id!,{...retry,data:{...retry.data,parts:[]}}))).toBe(false);
 const rows=(await db.query('SELECT visible_payload FROM event_projections WHERE conversation_id=$1',[f.id])).rows;
 expect(JSON.stringify(rows)).not.toContain('https:');expect(JSON.stringify(rows)).not.toContain('private representation');
}));

it('persists the exact original receipt when projected input wins the HTTP acknowledgement race without resending or renewing admission',()=>owned(async(db,ids)=>{
 const f=await fixture(db,false,undefined,false);ids.push(f.id);
 const before=(await db.query('SELECT input_event_id,native_turn_id,native_delivery_id,deadline_at,input_digest,output_tokens,dispatch_state,native_receipt FROM response_attempts WHERE id=$1',[f.attempt])).rows[0];
 expect(before).toMatchObject({dispatch_state:'admitted',native_delivery_id:f.delivery,native_receipt:null});
 const response=()=>Response.json({deliveryId:f.delivery,status:'accepted'},{status:202});
 await expect(recordNativeReceipt(f.actor,f.id,f.attempt,Response.json({deliveryId:randomUUID(),status:'accepted'},{status:202}))).rejects.toMatchObject({code:'native_receipt_changed'});
 await db.query("UPDATE event_projections SET turn_id='foreign_turn' WHERE native_event_id=$1",[before.input_event_id]);
 await expect(recordNativeReceipt(f.actor,f.id,f.attempt,response())).rejects.toMatchObject({code:'dispatch_claimed'});
 await db.query('UPDATE event_projections SET turn_id=$2 WHERE native_event_id=$1',[before.input_event_id,before.native_turn_id]);
 await recordNativeReceipt(f.actor,f.id,f.attempt,response());await recordNativeReceipt(f.actor,f.id,f.attempt,response());
 const after=(await db.query('SELECT input_event_id,native_turn_id,native_delivery_id,deadline_at,input_digest,output_tokens,dispatch_state,native_receipt FROM response_attempts WHERE id=$1',[f.attempt])).rows[0];
 expect(after).toEqual({...before,native_receipt:{deliveryId:f.delivery,status:'accepted'}});
 await expect(recordNativeReceipt(f.actor,f.id,f.attempt,Response.json({deliveryId:f.delivery,status:'changed'},{status:202}))).rejects.toMatchObject({code:'native_receipt_changed'});
 expect(Number((await db.query('SELECT count(*) FROM submitted_messages WHERE conversation_id=$1',[f.id])).rows[0].count)).toBe(1);
 expect(Number((await db.query('SELECT count(*) FROM ordinary_model_operations WHERE attempt_id=$1',[f.attempt])).rows[0].count)).toBe(0);
}));

it('persists the exact original receipt after a selected artifact input is projected first',()=>owned(async(db,ids)=>{
 await db.query('BEGIN');
 const actor=await createProfileTestSession(db as any,'panel'),source=await createArtifactDatabaseFixture(db as any,actor,DEMO_IDS.sharedCustomer);ids.push(source.conversationId);
 await db.query(`UPDATE artifact_extraction_runs SET state='published',scan_receipt='{}',coverage='{"total":1,"visited":1,"omitted":[]}',manifest_digest=$2,published_at=now() WHERE id=$1`,[source.runId,source.originalDigest]);
 await db.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[source.versionId]);await db.query("UPDATE artifact_versions SET state='ready' WHERE id=$1",[source.versionId]);
 const unit=randomUUID(),excerpt='Synthetic selected passage';
 await db.query(`INSERT INTO artifact_extraction_units(id,run_id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,ordinal,locator,text,origin) VALUES($1,$2,$3,$4,$5,$6,$7,1,'{"kind":"txt","lineStart":1,"lineEnd":1}',$8,'native')`,[unit,source.runId,source.versionId,process.env.TURAS_TEST_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.principalId,excerpt]);
 await db.query('COMMIT');
 await attachConversationArtifact(actor,source.conversationId,source.versionId);
 const key=(await db.query('SELECT creation_operation_id FROM conversations WHERE id=$1',[source.conversationId])).rows[0].creation_operation_id;
 const binding=await claimBinding(actor,source.conversationId,key);if(binding.state!=='claimed')throw Error('Artifact binding unavailable');const native='wrun_'+randomUUID();await bindNativeSession(actor,source.conversationId,binding.claimToken,native);
 await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,now())",[process.env.TURAS_TEST_ENVIRONMENT_ID,randomUUID()]);
 const text='Read this selected passage.',attempt=await prepareAttempt(actor,source.conversationId,native,randomUUID(),text,[{versionId:source.versionId,runId:source.runId,lifecycleGeneration:1,ranges:[{unitId:unit,start:0,end:excerpt.length}]}]);
 await claimDispatch(actor,source.conversationId,attempt.attemptId,0);const delivery=randomUUID();
 await db.query("INSERT INTO artifact_context_injection_receipts(attempt_id,turn_id,injection_digest) SELECT attempt_id,'turn_0',injection_digest FROM artifact_context_receipts WHERE attempt_id=$1",[attempt.attemptId]);
 await projectNativeEvent(native,attempt.attemptId,{type:'message.received',data:{message:text,turnId:'turn_0',sequence:0},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString(),deliveryIds:[delivery]}});
 await recordNativeReceipt(actor,source.conversationId,attempt.attemptId,Response.json({deliveryId:delivery,status:'accepted'},{status:202}));
 expect((await db.query('SELECT native_receipt FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].native_receipt).toEqual({deliveryId:delivery,status:'accepted'});
}));
