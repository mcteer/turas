import {refreshOrdinaryKnowledge} from '../../lib/server/conversations/current-knowledge';
import {requestOwnedTaskCancellation,settleInactiveOwnedCancellation} from '../../lib/server/conversations/cancel';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,it,expect} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {createProfileTestSession} from '../fixtures/profiles';
import {syntheticPlanContent} from '../fixtures/plans/seed';
import {submitPlanCommand} from '../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../lib/server/plans/decisions';
import {createFinanceInput} from '../../lib/server/staffing/economics';
import {withTransaction,getRuntimePool} from '../../lib/server/db/client';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {getOwnedConversation,createOwnedConversation} from '../../lib/server/conversations/repository';
import {assertNativeContextCurrent} from '../../lib/server/conversations/context-fence';
import {assertOperationsReadsCurrent} from '../../lib/server/ordinary-operations/consumption';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {submitExecutionCommand,readExecutionOverview,readExecutionRecords} from '../../lib/server/execution/service';
import {scopeRecord,executionCommand} from '../fixtures/execution/registers';
import {readOrdinaryCapacity,readOrdinaryEngagement,readOrdinaryPortfolio,calculateOrdinaryScenario} from '../../lib/server/ordinary-operations/reads';
import {approveOrdinaryIntervention,recordOrdinaryIntervention} from '../../lib/server/ordinary-operations/interventions';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
const url=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(url);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.toString();process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('ordinary real-domain reads and human intervention decisions preserve finance authority, no-write what-if, exact replay and immutable history',async()=>{
 const db=new Client({connectionString:url});await db.connect();const conversations:string[]=[];
 try{
  const [admin,author]=await withTransaction(async client=>[await createProfileTestSession(client,'mcteer'),await createProfileTestSession(client,'panel')]);
  const baseline=await withTransaction(async client=>{
   const content=syntheticPlanContent();content.assertions=[];content.sourceDependencies=[];content.asOf=new Date(Date.now()-10000).toISOString();
   const created=await submitPlanCommand(author,{action:'create',requestKey:randomUUID(),workspaceId:author.workspaceId,customerId:DEMO_IDS.sharedCustomer,workloadId:null,audience:'delivery',ownerMembershipId:author.membershipId,content},client);
   const submitted=await submitPlanCommand(author,{action:'submit',requestKey:randomUUID(),planId:created.planId,revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:created.aggregateVersion},client);
   const preview=await createPlanReviewPreview(admin,created.planId,{requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},client);
   return decidePlan(admin,created.planId,{action:'accept',requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Human reviewed an isolated planning fixture.',deliverySuitabilityConfirmed:true},client);
  });
  const engagementId=baseline.engagementId!,baselineId=baseline.baselineId!;
  async function principal(actor:typeof admin){
   const key=randomUUID();const c=(await createOwnedConversation(actor,{requestKey:key,title:'Ordinary operation fixture'})).conversation;conversations.push(c.id);
   const claim=await claimBinding(actor,c.id,key);if(claim.state!=='claimed')throw Error('Binding missing');
   const native='wrun_'+randomUUID();await bindNativeSession(actor,c.id,claim.claimToken,native);
   await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'operations-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
   const attempt=await prepareAttempt(actor,c.id,native,randomUUID(),'Review delivery operations.');await claimDispatch(actor,c.id,attempt.attemptId,0);
   return {principalId:actor.principalId,authenticator:'turas-session',principalType:'user',attributes:{turasAttemptId:attempt.attemptId,turasLoginSessionId:actor.sessionId,turasMembershipId:actor.membershipId}};
  }
  const owner=await principal(admin),member=await principal(author),today=new Date().toISOString().slice(0,10),period={fromDate:today,toDate:today},input={engagementId,...period};
  expect(await readOrdinaryEngagement(owner,input)).toMatchObject({summary:null,unavailableReason:'execution_not_initialized'});
  await submitExecutionCommand(author,engagementId,executionCommand('setup',{baseline:1,plan:baseline.aggregateVersion},{baselineId}));
  let view=await readExecutionOverview(author,engagementId);
  await submitExecutionCommand(author,engagementId,executionCommand('record.create',{execution:view.version},{baselineId,record:scopeRecord(baselineId)}));
  const proposed=(await readExecutionRecords(admin,engagementId,{kind:'scope_change'})).records[0];
  await expect(readOrdinaryEngagement({...owner,principalId:author.principalId},input)).rejects.toMatchObject({status:404});
  const endExclusive=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
  for(const [kind,minorUnits] of [['contracted_revenue','100000'],['nonlabor','20000']] as const)await createFinanceInput(admin,{requestKey:randomUUID(),rationale:'Human records only the selected one-day financial observation.',provenance:'Synthetic exact-period finance record, not a whole-engagement total.',input:{kind,engagementId,baselineId,currency:'USD',minorUnits,fromDate:today,toDate:endExclusive}});
  const brief=await readOrdinaryEngagement(owner,input);expect(brief.proposals.map(p=>p.id)).toContain(proposed.id);expect(brief.finance.status).toBe('available');
  expect(brief.finance).toMatchObject({values:{fee:null,nonlabor:null},periodFinancials:{fee:'100000',nonlabor:'20000',wholeEngagementBasis:false}});
  expect((await calculateOrdinaryScenario(owner,{...input,remainingHours:40,wholeEngagementLoadedRateMinorUnitsPerHour:'12500',currency:'USD'})).metrics).toMatchObject({status:'unknown',contribution:null});
  expect((await readOrdinaryEngagement(member,input)).finance.status).toBe('withheld');
  await expect(calculateOrdinaryScenario(member,{...input,remainingHours:40})).rejects.toMatchObject({status:403});
  const before=(await db.query('SELECT version,generation FROM execution_workspaces WHERE engagement_id=$1',[engagementId])).rows[0];
  const whatif=await calculateOrdinaryScenario(owner,{...input,remainingHours:40,wholeEngagementFeeMinorUnits:'6000000',wholeEngagementNonlaborMinorUnits:'0',wholeEngagementLoadedRateMinorUnitsPerHour:'12500',currency:'USD'});
  expect(whatif).toMatchObject({hypothetical:true,planningOnly:true,financialBasis:'explicit_whole_engagement_assumptions',metrics:{status:'known'},assumptions:{remainingMinutes:'2400'}});
  expect((await db.query('SELECT version,generation FROM execution_workspaces WHERE engagement_id=$1',[engagementId])).rows[0]).toEqual(before);
  expect((await readOrdinaryPortfolio(owner,period)).engagements.map(e=>e.engagement.engagementId)).toContain(engagementId);
  expect((await readOrdinaryCapacity(member,period)).synthetic).toBe(false);
  const command={engagementId,proposalId:proposed.id,proposalRevisionId:proposed.revisionId,expectedVersion:proposed.version,idempotencyKey:randomUUID(),status:'deferred',rationale:'Human defers this exact proposed scope change.'};
  await expect(recordOrdinaryIntervention(owner,command,'no-approval')).rejects.toMatchObject({code:'human_approval_required'});
  await expect(approveOrdinaryIntervention(member,command,{requestId:randomUUID(),callId:'member'})).rejects.toMatchObject({status:403});
  await expect(approveOrdinaryIntervention(owner,{...command,expectedVersion:command.expectedVersion+1},{requestId:randomUUID(),callId:'stale'})).rejects.toMatchObject({status:409});
  const decision=await approveOrdinaryIntervention(owner,command,{requestId:'native-1',callId:'call-1'});
  expect((await recordOrdinaryIntervention(owner,command,'call-1')).decision.id).toBe(decision.id);
  expect((await approveOrdinaryIntervention(owner,command,{requestId:'native-2',callId:'call-2'})).id).toBe(decision.id);
  expect((await recordOrdinaryIntervention(owner,command,'call-2')).decision.id).toBe(decision.id);
  await expect(approveOrdinaryIntervention(owner,{...command,status:'approved'},{requestId:'native-3',callId:'call-3'})).rejects.toMatchObject({status:409});
  expect((await db.query('SELECT count(*)::int AS n FROM ordinary_intervention_decisions WHERE id=$1',[decision.id])).rows[0].n).toBe(1);
  await expect(db.query('UPDATE ordinary_intervention_decisions SET rationale=$2 WHERE id=$1',[decision.id,'Different rationale'])).rejects.toMatchObject({code:'23514'});
  expect((await db.query('SELECT version,generation FROM execution_workspaces WHERE engagement_id=$1',[engagementId])).rows[0]).toEqual(before);

  // New threads consume only the current initialized snapshot. Real provider and
  // persisted-history entry points must recheck those exact reads afterward.
  await settleSyntheticConversationAttempts(db,conversations);
  const consumed=await principal(admin);await readOrdinaryEngagement(consumed,input);
  const consumedThread=(await db.query('SELECT c.id,c.eve_session_id FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id WHERE a.id=$1',[consumed.attributes.turasAttemptId])).rows[0];
  const freshSubmitting=await withTransaction(tx=>createProfileTestSession(tx,'mcteer'));
  await db.query(`INSERT INTO ordinary_continuation_authorities(id,attempt_id,login_session_id,membership_id,owner_principal_id,workspace_id,environment_id,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),consumed.attributes.turasAttemptId,freshSubmitting.sessionId,freshSubmitting.membershipId,freshSubmitting.principalId,freshSubmitting.workspaceId,process.env.TURAS_ENVIRONMENT_ID,freshSubmitting.expiresAt]);
  const rejectedOldSession={...command,idempotencyKey:randomUUID()};await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[admin.sessionId]);
  try{await expect(approveOrdinaryIntervention(consumed,rejectedOldSession,{requestId:'revoked-submitter',callId:'revoked-submitter'})).rejects.toMatchObject({status:401});}
  finally{await db.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[admin.sessionId]);}
  expect((await db.query('SELECT count(*)::int AS n FROM ordinary_intervention_decisions WHERE request_key=$1',[rejectedOldSession.idempotencyKey])).rows[0].n).toBe(0);
  const exactFresh={...consumed,attributes:{...consumed.attributes,turasLoginSessionId:freshSubmitting.sessionId}};
  const exactDecision=await approveOrdinaryIntervention(exactFresh,{...command,idempotencyKey:randomUUID()},{requestId:'exact-fresh-submitter',callId:'exact-fresh-submitter'});
  expect((await db.query('SELECT actor_session_id FROM ordinary_intervention_decisions WHERE id=$1',[exactDecision.id])).rows[0].actor_session_id).toBe(freshSubmitting.sessionId);
  // A revoked latest continuation must not reject a different valid exact
  // submitting login; approval does not borrow the revoked continuation.
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[freshSubmitting.sessionId]);
  try{const validOlder=await approveOrdinaryIntervention(consumed,{...command,idempotencyKey:randomUUID()},{requestId:'valid-older-submitter',callId:'valid-older-submitter'});expect((await db.query('SELECT actor_session_id FROM ordinary_intervention_decisions WHERE id=$1',[validOlder.id])).rows[0].actor_session_id).toBe(admin.sessionId);}
  finally{await db.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[freshSubmitting.sessionId]);}
  const consumedDecision={...command,idempotencyKey:randomUUID()};await approveOrdinaryIntervention(consumed,consumedDecision,{requestId:'consumed-read-approval',callId:'consumed-read-call'});await expect(recordOrdinaryIntervention(consumed,consumedDecision,'consumed-read-call')).resolves.toMatchObject({status:'recorded'});
  // Deterministically hold the canonical reader's plan prefix before an
  // approval starts. The old record→plan UPDATE ordering then blocked on this
  // prefix while holding the record, and the real snapshot reader deadlocked.
  const blocker=await getRuntimePool().connect();await blocker.query('BEGIN');
  let concurrentApproval:Promise<unknown>|undefined;
  try{
   await blocker.query('SELECT p.id FROM delivery_plans p JOIN milestone_baselines b ON b.plan_id=p.id WHERE b.id=$1 FOR SHARE OF p',[baselineId]);
   let settled=false;
   concurrentApproval=approveOrdinaryIntervention(consumed,{...command,idempotencyKey:randomUUID()},{requestId:'concurrent-source-read',callId:'concurrent-source-read'}).then(value=>{settled=true;return value;},error=>{settled=true;throw error;});
   void concurrentApproval.catch(()=>{});
   const deadline=Date.now()+4000;
   while(!settled&&Date.now()<deadline){
    if((await blocker.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%delivery_plans%' LIMIT 1")).rowCount)break;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   await assertOperationsReadsCurrent(blocker,admin,consumedThread.id);
   await blocker.query('COMMIT');
   await expect(concurrentApproval).resolves.toMatchObject({proposalId:proposed.id});
  }catch(error){await blocker.query('ROLLBACK');await concurrentApproval?.catch(()=>{});throw error;}finally{blocker.release();}
  const admissionBefore=Number((await db.query("SELECT COALESCE(sum(count),0)::int AS n FROM execution_rate_windows WHERE membership_id=$1 AND bucket='read'",[admin.membershipId])).rows[0].n);
  await expect(Promise.all([assertNativeContextCurrent(admin,consumedThread.eve_session_id),assertNativeContextCurrent(admin,consumedThread.eve_session_id),withTransaction(tx=>refreshOrdinaryKnowledge(tx,admin,consumed,consumedThread.id,consumed.attributes.turasAttemptId)),withTransaction(tx=>refreshOrdinaryKnowledge(tx,admin,consumed,consumedThread.id,consumed.attributes.turasAttemptId))])).resolves.toHaveLength(4);
  expect(Number((await db.query("SELECT COALESCE(sum(count),0)::int AS n FROM execution_rate_windows WHERE membership_id=$1 AND bucket='read'",[admin.membershipId])).rows[0].n)).toBe(admissionBefore);
  await expect(getOwnedConversation(admin,consumedThread.id)).resolves.toMatchObject({id:consumedThread.id});
  await db.query("UPDATE memberships SET role='member' WHERE id=$1",[admin.membershipId]);
  const withoutFinance={...admin,role:'member' as const};
  try{await expect(assertNativeContextCurrent(withoutFinance,consumedThread.eve_session_id)).rejects.toMatchObject({status:404});await expect(getOwnedConversation(withoutFinance,consumedThread.id)).rejects.toMatchObject({status:404});}
  finally{await db.query("UPDATE memberships SET role='admin' WHERE id=$1",[admin.membershipId]);}
  // Changing the exact consumed execution revision invalidates both paths even
  // though customer grant and finance permission are still current.
  const current=await readExecutionOverview(author,engagementId);
  await submitExecutionCommand(author,engagementId,executionCommand('record.revise',{execution:current.version,record:proposed.version},{recordId:proposed.id,record:{...scopeRecord(baselineId),narrative:'A material source revision replaced the consumed proposal.'}}));
  await expect(assertNativeContextCurrent(admin,consumedThread.eve_session_id)).rejects.toMatchObject({status:404});
  await expect(getOwnedConversation(admin,consumedThread.id)).rejects.toMatchObject({status:404});
  await expect(withTransaction(tx=>assertOperationsReadsCurrent(tx,admin,consumedThread.id))).rejects.toMatchObject({status:404});
  await expect(requestOwnedTaskCancellation(author,consumedThread.eve_session_id)).rejects.toMatchObject({status:404});
  await expect(requestOwnedTaskCancellation(admin,consumedThread.eve_session_id)).resolves.toBeUndefined();
  await expect(settleInactiveOwnedCancellation(admin,consumedThread.eve_session_id)).resolves.toBeUndefined();
  await expect(assertNativeContextCurrent(admin,consumedThread.eve_session_id)).rejects.toMatchObject({status:404});
  await expect(getOwnedConversation(admin,consumedThread.id)).rejects.toMatchObject({status:404});
  await settleSyntheticConversationAttempts(db,conversations);
  const partner=await withTransaction(tx=>createProfileTestSession(tx,'partner')),partnerRead=await principal(partner);
  await readOrdinaryEngagement(partnerRead,input);
  const partnerThread=(await db.query('SELECT c.id,c.eve_session_id FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id WHERE a.id=$1',[partnerRead.attributes.turasAttemptId])).rows[0];
  await expect(assertNativeContextCurrent(partner,partnerThread.eve_session_id)).resolves.toBeUndefined();
  await db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1 AND customer_id=$2",[partner.membershipId,DEMO_IDS.sharedCustomer]);
  try{await expect(assertNativeContextCurrent(partner,partnerThread.eve_session_id)).rejects.toMatchObject({status:404});await expect(getOwnedConversation(partner,partnerThread.id)).rejects.toMatchObject({status:404});await expect(requestOwnedTaskCancellation(admin,partnerThread.eve_session_id)).rejects.toMatchObject({status:404});await expect(requestOwnedTaskCancellation(partner,partnerThread.eve_session_id)).resolves.toBeUndefined();await expect(settleInactiveOwnedCancellation(partner,partnerThread.eve_session_id)).resolves.toBeUndefined();await expect(assertNativeContextCurrent(partner,partnerThread.eve_session_id)).rejects.toMatchObject({status:404});}
  finally{await db.query("UPDATE customer_grants SET state='active' WHERE membership_id=$1 AND customer_id=$2",[partner.membershipId,DEMO_IDS.sharedCustomer]);}
 }finally{await settleSyntheticConversationAttempts(db,conversations);await db.end();}
},60000);
