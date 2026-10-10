import type {AttachSessionFn} from 'eve/channels';
import {processLearningNativeRetirement} from '../../lib/server/learning/native-retirement';
import {readPublishedKnowledge} from '../../lib/server/knowledge/read';
import {learningAcceptedOriginal} from '../fixtures/learning/setup';
import {installLearningSyntheticPrice} from '../fixtures/learning/native-preparation';
import {prepareLearningDraft} from '../../lib/server/learning/advisory';
import {hashSessionToken} from '../../lib/server/auth/sessions';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../lib/server/staffing/native-admission';
import {cancelLearningDraft,learningDraftMeta} from '../../lib/server/learning/advisory';
import {readLearningBudget} from '../../lib/server/learning/budget';
import {randomUUID} from 'node:crypto';
import {reconcileLearningLifecycle} from '../../lib/server/learning/lifecycle';
import {readLearningDashboard} from '../../lib/server/learning/dashboard';
import {readLearningRefreshHandoff} from '../../lib/server/learning/refresh-handoff';
import {describe,it,expect} from 'vitest';
import {withLearningDatabase} from '../fixtures/learning/environment';
import {learningNativeFixture} from '../fixtures/learning/native';
import {runLearningMaintenanceTick} from '../../lib/server/learning/maintenance';
import {markDueLearningReviews} from '../../lib/server/learning/refresh';
import {learningMeasurementPopulation} from '../fixtures/learning/accepted-measurements';
import {createLearningMeasurement} from '../../lib/server/learning/measurements';
import {scheduleLearningPayloadPurge} from '../../lib/server/learning/retention';
describe('bounded learning maintenance',()=>{
 it('settles an expired prepared operation without invoking or inventing provider accounting while disabled',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db),at=new Date(Date.now()+600000);
  await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);
  const result=await runLearningMaintenanceTick({at,nativeRetirement:false});expect(result.processed).toBeGreaterThan(0);expect(result.processed).toBeLessThanOrEqual(100);
  expect((await db.query('SELECT state FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].state).toBe('failed');
  expect((await db.query('SELECT count(*)::int n FROM learning_model_dispatches d JOIN learning_budget_reservations r ON r.id=d.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
  await runLearningMaintenanceTick({at,nativeRetirement:false});expect((await db.query('SELECT count(*)::int n FROM learning_cleanup_jobs WHERE owner_id=$1',[f.meta.id])).rows[0].n).toBe(1);
 }));
 it('deduplicates due review work without changing original dates or starting external research',async()=>withLearningDatabase(async db=>{
  const f=await learningMeasurementPopulation(db,1),created=await createLearningMeasurement(f.actors.member,f.measurements[0].input),at=new Date(Date.now()+172800000);
  const before=(await db.query('SELECT payload FROM profile_revisions WHERE id=$1',[f.measurements[0].original.sourceRevisionId])).rows[0].payload;
  await markDueLearningReviews(db,at);await markDueLearningReviews(db,at);
  const revision=(await db.query('SELECT head_revision_id FROM learning_measurement_contributions WHERE id=$1',[created.targetId])).rows[0].head_revision_id;
  expect((await db.query('SELECT count(*)::int n FROM learning_refresh_jobs WHERE owner_id=$1',[revision])).rows[0].n).toBe(1);
  expect((await db.query('SELECT payload FROM profile_revisions WHERE id=$1',[f.measurements[0].original.sourceRevisionId])).rows[0].payload).toEqual(before);
  expect((await db.query('SELECT state FROM learning_measurement_contributions WHERE id=$1',[created.targetId])).rows[0].state).toBe('proposed');
 }));
 it('keeps authorized due metadata visible after original loss and delegates refresh without accepting facts',async()=>withLearningDatabase(async db=>{
  const f=await learningMeasurementPopulation(db,1),created=await createLearningMeasurement(f.actors.member,f.measurements[0].input),at=new Date(Date.now()+172800000);
  await markDueLearningReviews(db,at);
  const job=(await db.query("SELECT j.id FROM learning_refresh_jobs j JOIN learning_measurement_contributions c ON c.head_revision_id=j.owner_id WHERE c.id=$1",[created.targetId])).rows[0];
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[f.measurements[0].original.sourceRevisionId]);
  await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);
  const health=await readLearningDashboard(f.actors.member,{});expect(health.operations.some(item=>item.jobId===job.id&&item.measurementId===created.targetId)).toBe(true);
  const before=(await db.query('SELECT count(*)::int n FROM research_requests')).rows[0].n;
  const handoff=await readLearningRefreshHandoff(f.actors.member,job.id);expect(handoff.version).toBe(1);expect(handoff.enabled).toBe(false);expect(handoff.researchHref).toBeNull();expect(handoff.sources).toEqual([]);expect(handoff.reviewHref).toBe('/learning/measurements/'+created.targetId);expect(JSON.stringify(handoff)).not.toContain('payload');
  expect((await db.query('SELECT count(*)::int n FROM research_requests')).rows[0].n).toBe(before);
  await expect(readLearningRefreshHandoff(f.actors.partner,job.id)).rejects.toMatchObject({status:403});
 }));
 it('preserves the earliest purge deadline across retries and permits disabled cleanup',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db),early=new Date(Date.now()-1000);
  await scheduleLearningPayloadPurge(db,f.meta.id,'attempt','global_invalidated',early,early);
  await runLearningMaintenanceTick({at:new Date(Date.now()+600000),nativeRetirement:false});
  expect((await db.query("SELECT purge_at FROM learning_payload_states WHERE owner_id=$1 AND kind='attempt'",[f.meta.id])).rows[0].purge_at).toEqual(early);
  // Private native context is retained until its exact native reset receipt exists.
  expect((await db.query('SELECT count(*)::int n FROM learning_attempt_payloads WHERE attempt_id=$1',[f.meta.id])).rows[0].n).toBeGreaterThan(0);
 }));
 it('fences global measurement source loss with workers stopped and never extends its purge deadline',async()=>withLearningDatabase(async db=>{
  const f=await learningMeasurementPopulation(db,1),created=await createLearningMeasurement(f.actors.member,f.measurements[0].input),revision=(await db.query('SELECT head_revision_id FROM learning_measurement_contributions WHERE id=$1',[created.targetId])).rows[0].head_revision_id,at=new Date();
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[f.measurements[0].original.sourceRevisionId]);
  await reconcileLearningLifecycle(at,revision);
  const deadline=(await db.query("SELECT purge_at FROM learning_payload_states WHERE owner_id=$1 AND kind='measurement'",[revision])).rows[0].purge_at;
  expect(deadline.getTime()).toBeLessThanOrEqual(at.getTime()+86400000);
  await reconcileLearningLifecycle(new Date(at.getTime()+120000),revision);
  expect((await db.query("SELECT purge_at FROM learning_payload_states WHERE owner_id=$1 AND kind='measurement'",[revision])).rows[0].purge_at).toEqual(deadline);
 }));
 it('anchors delayed reconciliation to the original source loss rather than restarting its 24 hour clock',async()=>withLearningDatabase(async db=>{
  const f=await learningMeasurementPopulation(db,1),created=await createLearningMeasurement(f.actors.member,f.measurements[0].input),revision=(await db.query('SELECT head_revision_id FROM learning_measurement_contributions WHERE id=$1',[created.targetId])).rows[0].head_revision_id;
  const original=f.measurements[0].original.sourceRevisionId;
  const lost=(await db.query(`INSERT INTO profile_lifecycle_events(id,record_id,revision_id,event_type,previous_head_id,actor_membership_id,rationale,command_receipt_id) SELECT $1,record_id,id,'retract',id,$3,'Synthetic source withdrawal',$4 FROM profile_revisions WHERE id=$2 RETURNING created_at`,[randomUUID(),original,f.actors.admin.membershipId,randomUUID()])).rows[0].created_at;
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[original]);
  await reconcileLearningLifecycle(new Date(lost.getTime()+3*86400000),revision);
  expect((await db.query("SELECT purge_at FROM learning_payload_states WHERE owner_id=$1 AND kind='measurement'",[revision])).rows[0].purge_at.getTime()).toBe(lost.getTime()+86400000);
 }));
 it('separates authorized health panels, preserves unknown dates while disabled, and denies partners',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db,{baseline:true});await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);
  const health=await readLearningDashboard(f.actor,{});expect(health.enabled).toBe(false);expect(health.evidence).toHaveLength(1);expect(health.evidence[0].quality.rubricVersion).toBe('evidence-quality-v1');expect(health.evidence[0].originalDates[0].publicationAt).toBeNull();expect(health.scope).toContain('aggregate families are separate');expect(JSON.stringify(health)).not.toContain('participantCount');
  await expect(readLearningDashboard(f.actors.partner,{})).rejects.toMatchObject({status:403});
 }));

 it('releases only a proved undispatched reservation and keeps a claimed unknown provider hold',async()=>withLearningDatabase(async db=>{
  for(const dispatched of [false,true]){
   const f=await learningNativeFixture(db);await admitGovernedStaffingModelStep(f.principal,f.identity);if(dispatched)await assertGovernedStaffingProviderRelease(f.principal,f.identity);
   const current=await learningDraftMeta(f.actor,f.meta.id);await cancelLearningDraft(f.actor,f.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:current.version,rationale:'Synthetic reservation cancellation'});
   await runLearningMaintenanceTick({nativeRetirement:false});
   const release=(await db.query('SELECT count(*)::int n FROM learning_reservation_releases release JOIN learning_budget_reservations r ON r.id=release.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0];expect(release.n).toBe(dispatched?0:1);
   expect((await db.query('SELECT count(*)::int n FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
   const budget=await readLearningBudget(f.actors.admin,f.meta.budgetId);expect(budget.blocked).toBe(dispatched);expect(budget.reservations[0].releasedWithoutDispatch).toBe(!dispatched);
   if(dispatched)await expect(db.query("INSERT INTO learning_reservation_releases(reservation_id,reason) SELECT id,'terminal_without_dispatch' FROM learning_budget_reservations WHERE attempt_id=$1",[f.meta.id])).rejects.toMatchObject({code:'23514'});
  }
 }));

 it('retires only a revoked session while preserving another live session and independent published reuse',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db,{baseline:true});await admitGovernedStaffingModelStep(f.principal,f.identity);await assertGovernedStaffingProviderRelease(f.principal,f.identity);
  const customerId=randomUUID(),sessionId=randomUUID(),token='S'.repeat(43),actor={...f.actor,sessionId,token};
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Second synthetic learning customer',true)",[customerId,f.workspaceId]);
  await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')",[sessionId,f.actor.principalId,hashSessionToken(token)]);
  const lineage=await learningAcceptedOriginal(db,actor,f.actors.admin,customerId);installLearningSyntheticPrice();
  const second=await prepareLearningDraft(actor,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,customerId,lineage:[lineage],feedbackIds:[],question:'Another independently admitted synthetic scope',budgetUsd:'25'});
  await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);
  await runLearningMaintenanceTick({nativeRetirement:false});
  expect((await db.query('SELECT state,failure_code FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0]).toMatchObject({state:'invalidated',failure_code:'actor_unavailable'});
  expect((await learningDraftMeta(actor,second.targetId!)).state).toBe('prepared');
  expect((await db.query('SELECT count(*)::int n FROM learning_cleanup_jobs WHERE owner_id=$1',[second.targetId])).rows[0].n).toBe(0);
  expect((await readLearningBudget(f.actors.admin,f.meta.budgetId)).blocked).toBe(true);
  expect((await db.query('SELECT count(*)::int n FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id WHERE r.attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
  expect((await readPublishedKnowledge(db,f.actors.admin,f.baseline!.publicationId)).payload.title).toBe('Synthetic original baseline practice');
 }));

 it('uses exact hosted session handles with 1/5/15 minute retries and fences a crashed final claim',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db),view=await learningDraftMeta(f.actor,f.meta.id);await cancelLearningDraft(f.actor,f.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version,rationale:'Synthetic timer retry fixture'});
  let calls=0;const attach=((id:string)=>({reset:async()=>{expect(id).toBe(f.nativeSessionId);calls++;throw Error('Synthetic transient reset failure');}})) as unknown as AttachSessionFn;
  let at=new Date(Date.now()+100);for(const [index,minutes] of [1,5,15,15].entries()){
   expect(await processLearningNativeRetirement({at,ownerId:f.meta.id,attachSession:attach})).toBe(true);const job=(await db.query('SELECT * FROM learning_cleanup_jobs WHERE owner_id=$1',[f.meta.id])).rows[0];expect(job.attempts).toBe(index+1);expect(job.state).toBe(index===3?'review_required':'pending');expect(job.next_attempt_at.getTime()-at.getTime()).toBe(minutes*60000);
   expect(await processLearningNativeRetirement({at:new Date(job.next_attempt_at.getTime()-1),ownerId:f.meta.id,attachSession:attach})).toBe(false);at=job.next_attempt_at;
  }
  expect(calls).toBe(4);expect((await db.query('SELECT count(*)::int n FROM learning_native_retirement_receipts WHERE attempt_id=$1',[f.meta.id])).rows[0].n).toBe(0);
  const crashed=await learningNativeFixture(db),current=await learningDraftMeta(crashed.actor,crashed.meta.id);await cancelLearningDraft(crashed.actor,crashed.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:current.version,rationale:'Synthetic interrupted final storage claim'});await db.query("UPDATE learning_cleanup_jobs SET state='running',attempts=4,next_attempt_at=$2 WHERE owner_id=$1",[crashed.meta.id,at]);
  expect(await processLearningNativeRetirement({at,ownerId:crashed.meta.id,attachSession:attach})).toBe(true);expect(calls).toBe(4);expect((await db.query('SELECT state FROM learning_cleanup_jobs WHERE owner_id=$1',[crashed.meta.id])).rows[0].state).toBe('review_required');
 }));
 it('records a hosted reset receipt only for its exact fixed session, without a loopback service',async()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db),current=await learningDraftMeta(f.actor,f.meta.id);await cancelLearningDraft(f.actor,f.meta.id,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:current.version,rationale:'Synthetic exact hosted reset'});
  let calls=0;const attach=((id:string)=>({reset:async()=>{expect(id).toBe(f.nativeSessionId);calls++;return {status:'reset',previousSessionId:id};}})) as unknown as AttachSessionFn;
  expect(await processLearningNativeRetirement({ownerId:f.meta.id,attachSession:attach})).toBe(true);expect(calls).toBe(1);expect(await processLearningNativeRetirement({ownerId:f.meta.id,attachSession:attach})).toBe(false);expect((await db.query('SELECT native_session_id FROM learning_native_retirement_receipts WHERE attempt_id=$1',[f.meta.id])).rows[0].native_session_id).toBe(f.nativeSessionId);
 }));

});
