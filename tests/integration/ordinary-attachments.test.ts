import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt} from '../../lib/server/conversations/dispatch';
import {intakeOrdinaryAttachmentContext} from '../../lib/server/conversations/attachment-intake';
import {formatAttachmentText} from '../../lib/conversations/attachment-text';
const url=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(url);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.toString();process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it.each(['internal','partner'] as const)('admits customer-free documents as immutable sends and idempotent unaccepted drafts without indexing human claims (%s)',async kind=>{
 const db=new Client({connectionString:url});await db.connect();const owned:string[]=[];
 try{
  const actor=await isolatedChatActor(db,kind,kind==='internal'?'admin':'member'),customer=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Attachment fixture account',false)",[customer,actor.workspaceId]);
  if(kind==='partner')await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,customer,actor.membershipId,actor.principalId]);
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});owned.push(conversation.id);
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Fixture binding unavailable');
  const native=`wrun_${randomUUID()}`;await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'attachment-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const excerpt='Attachment fixture account customer context: '+ 'Unverified human assertion. '.repeat(800);
  const text='Discuss this context.\n\n'+formatAttachmentText('account.txt','text/plain',excerpt),request=randomUUID();
  const attempt=await prepareAttempt(actor,conversation.id,native,request,text);
  expect(await intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).toEqual({drafts:1,unresolved:0});
  // Renaming the customer between retries must not retarget or duplicate intake.
  await db.query("UPDATE customer_references SET display_name='Renamed attachment account' WHERE id=$1",[customer]);
  expect(await intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).toEqual({drafts:1,unresolved:0});
  const records=(await db.query('SELECT current_accepted_revision_id FROM profile_records WHERE customer_id=$1',[customer])).rows;
  const payload=(await db.query('SELECT v.payload FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE r.customer_id=$1',[customer])).rows[0].payload;
  expect(payload.legacyJourney.source.excerpt).toBe(excerpt.slice(0,12000).trim());
  expect(payload.sourceExcerpt.length).toBeLessThanOrEqual(8000);
  expect(records).toHaveLength(1);expect(records[0].current_accepted_revision_id).toBeNull();
  expect((await db.query('SELECT count(*)::int AS count FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.customer_id=$1',[customer])).rows[0].count).toBe(0);
  await expect(prepareAttempt(actor,conversation.id,native,request,text+'changed')).rejects.toMatchObject({status:409});
  await expect(prepareAttempt(actor,conversation.id,native,randomUUID(),'a'.repeat(16385))).rejects.toMatchObject({status:413});
  const other=await isolatedChatActor(db,'internal','member',actor.workspaceId);
  await expect(intakeOrdinaryAttachmentContext(other,conversation.id,attempt.attemptId)).rejects.toMatchObject({status:404});
 }finally{try{await settleSyntheticConversationAttempts(db,owned);}finally{await db.end();}}
});
it('withholds ambiguous and newly revoked customer intake, and honors the release switch',async()=>{
 const db=new Client({connectionString:url});await db.connect();const owned:string[]=[];
 try{
  const actor=await isolatedChatActor(db,'partner','member'),a=randomUUID(),b=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$3,'Attachment Alpha',false),($2,$3,'Attachment Alpha team',false)",[a,b,actor.workspaceId]);
  for(const id of [a,b])await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,id,actor.membershipId,actor.principalId]);
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});owned.push(conversation.id);
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Fixture binding unavailable');
  const native=`wrun_${randomUUID()}`;await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'attachment-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),formatAttachmentText('account.txt','text/plain','Attachment Alpha team customer context.'));
  expect(await intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).toEqual({drafts:0,unresolved:1});
  await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1",[actor.membershipId]);
  expect(await intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).toEqual({drafts:0,unresolved:1});
  expect((await db.query('SELECT count(*)::int AS count FROM profile_records WHERE workspace_id=$1',[actor.workspaceId])).rows[0].count).toBe(0);
  process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED='1';
  await expect(intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).rejects.toMatchObject({status:503,code:'attachments_unavailable'});
 }finally{delete process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED;try{await settleSyntheticConversationAttempts(db,owned);}finally{await db.end();}}
});

it.each(['internal','partner'] as const)('routes named attachment context independently of a selected live customer (%s)',async kind=>{
 const db=new Client({connectionString:url});await db.connect();const owned:string[]=[];
 try{
  const actor=await isolatedChatActor(db,kind,kind==='internal'?'admin':'member'),selected=randomUUID(),named=randomUUID();
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$3,'Selected attachment account',false),($2,$3,'Named document account',false)",[selected,named,actor.workspaceId]);
  for(const id of [selected,named]){
   if(kind==='partner')await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,id,actor.membershipId,actor.principalId]);
  }
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key,customerId:selected});owned.push(conversation.id);
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Fixture binding unavailable');
  const native=`wrun_${randomUUID()}`;await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'attachment-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),formatAttachmentText('named-account.txt','text/plain','Named document account customer context: a human-supplied assertion.'));
  expect(await intakeOrdinaryAttachmentContext(actor,conversation.id,attempt.attemptId)).toEqual({drafts:1,unresolved:0});
  const records=(await db.query('SELECT customer_id,current_accepted_revision_id FROM profile_records WHERE workspace_id=$1',[actor.workspaceId])).rows;
  expect(records).toEqual([{customer_id:named,current_accepted_revision_id:null}]);
 }finally{try{await settleSyntheticConversationAttempts(db,owned);}finally{await db.end();}}
});
