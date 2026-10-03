import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { withTransaction } from '../../lib/server/db/client';
import { createExecutionBaseline } from '../fixtures/execution/baseline';
import { submitExecutionCommand,readExecutionOverview,readExecutionRecords,previewExecutionCommand } from '../../lib/server/execution/service';
import { milestoneTransition } from '../../lib/server/execution/milestones';
import { ingestVerifiedResearch } from '../../lib/server/profiles/research';
import { materializeCurrentProjection } from '../../lib/server/retrieval/projections';
import { submitProfileCommand } from '../../lib/server/profiles/service';
import type { ExecutionSource } from '../../lib/server/execution/schema';
const envelope=(action:string,expectedVersions:Record<string,number>,payload:unknown)=>({version:'execution-v1',action,expectedVersions,payload});
async function fixture(references:ExecutionSource[]=[]){
  const f=await withTransaction(db=>createExecutionBaseline(db));
  await submitExecutionCommand(f.author,f.engagementId,{...envelope('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}),requestKey:randomUUID()});
  let view=await readExecutionOverview(f.author,f.engagementId);
  await submitExecutionCommand(f.author,f.engagementId,{...envelope('record.create',{execution:view.version},{baselineId:f.baselineId,record:{kind:'activity',subtype:'work',title:'Synthetic reviewed result',
    narrative:'Human reviewed this synthetic capability observation and its evidence.',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:['proof_done'],ownerMembershipId:null,unknownOwnerReason:'Not assigned',references}}),requestKey:randomUUID()});
  let record=(await readExecutionRecords(f.author,f.engagementId,{})).records[0];view=await readExecutionOverview(f.author,f.engagementId);
  await submitExecutionCommand(f.author,f.engagementId,{...envelope('record.submit',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}),requestKey:randomUUID()});
  record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records[0];view=await readExecutionOverview(f.reviewer,f.engagementId);
  const candidate=envelope('record.accept',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest});
  const preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...preview,requestKey:randomUUID(),rationale:'Human exact evidence review'});
  return {...f,record};
}
async function decide(f:Awaited<ReturnType<typeof fixture>>,decision:string,evidenceRevisionIds:string[]=[]){
  const view=await readExecutionOverview(f.reviewer,f.engagementId),milestone=view.milestones.find(m=>m.key==='proof_done')!;
  const candidate=envelope('milestone.decide',{execution:view.version,milestone:milestone.version},{baselineId:f.baselineId,milestoneKey:'proof_done',decision,evidenceRevisionIds});
  const preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  return submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...preview,requestKey:randomUUID(),rationale:'Human explicit milestone decision'});
}
describe('explicit execution milestone decisions',()=>{
  it('enforces the complete transition graph without hours-derived completion',()=>{
    for(const [state,event,next] of [['not_started','start','in_progress'],['in_progress','block','blocked'],['blocked','resume','in_progress'],['in_progress','request_review','ready_for_review'],['blocked','request_review','ready_for_review'],['ready_for_review','accept','accepted'],['accepted','reopen','in_progress'],['waived','reopen','in_progress']])expect(milestoneTransition(state,event)).toBe(next);
    for(const state of ['not_started','in_progress','blocked','ready_for_review'])expect(milestoneTransition(state,'waive')).toBe('waived');
    expect(()=>milestoneTransition('not_started','accept')).toThrow();expect(()=>milestoneTransition('accepted','start')).toThrow();
  });
  it('requires reviewed evidence, supports explicit acceptance/reopening, and rejects stale preview',async()=>{
    const f=await fixture();await decide(f,'start');
    const staleView=await readExecutionOverview(f.reviewer,f.engagementId),staleHead=staleView.milestones.find(m=>m.key==='proof_done')!;
    const staleCandidate=envelope('milestone.decide',{execution:staleView.version,milestone:staleHead.version},{baselineId:f.baselineId,milestoneKey:'proof_done',decision:'waive',evidenceRevisionIds:[]});
    const stalePreview=await previewExecutionCommand(f.reviewer,f.engagementId,staleCandidate);
    await decide(f,'block');
    await expect(submitExecutionCommand(f.reviewer,f.engagementId,{...staleCandidate,...stalePreview,requestKey:randomUUID(),rationale:'Stale preview must not apply'})).rejects.toMatchObject({status:409});
    expect((await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')?.state).toBe('blocked');
    await decide(f,'resume');
    await decide(f,'request_review');
    await expect(decide(f,'accept')).rejects.toMatchObject({status:422});
    await decide(f,'accept',[f.record.revisionId]);
    expect((await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')?.state).toBe('accepted');
    await decide(f,'reopen');await decide(f,'waive');
    expect((await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')?.state).toBe('waived');
  },180000);
  it('withholds source prose and overlays review-required immediately after withdrawal with cleanup paused',async()=>{
    const source=await withTransaction(async db=>{
      const base=await createExecutionBaseline(db);
      const ingested=await ingestVerifiedResearch({workspaceId:base.author.workspaceId,customerId:base.customerId,trustedIdentity:'synthetic-fixture-v1',
        location:`https://example.com/execution-${randomUUID()}`,title:'Synthetic delivery capability',passage:'PRIVATE_WITHDRAWN_EXECUTION_SENTINEL',supportedClaim:'Synthetic delivery capability',
        publicationAt:'2026-09-28T12:00:00Z',retrievalAt:'2026-09-29T12:00:00Z',rights:'Synthetic owned source',audience:'delivery',
        qualityInput:{rubricVersion:'evidence-quality-v1',R:3,D:4,C:1,reliabilityRationale:'Named synthetic source',directnessRationale:'Direct synthetic passage',corroborationRationale:'Single source',informationType:'product_capability',dateBasis:'publication'},
        checks:{identity:true,scope:true,integrity:true,content:true,rationale:'Synthetic exact source checked',checkVersion:'research-check-v1'}},db);
      const id=await materializeCurrentProjection(db,'verified_research',ingested.sourceRevisionId,'delivery');
      const projected=(await db.query('SELECT s.source_generation,s.content_digest,p.locators FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.id=$1 LIMIT 1',[id])).rows[0];
      return {base,sourceRevisionId:ingested.sourceRevisionId,reference:{id:randomUUID(),kind:'verified_research' as const,sourceRevisionId:ingested.sourceRevisionId,generation:Number(projected.source_generation),contentDigest:projected.content_digest,locator:projected.locators[0]} as ExecutionSource};
    });
    const f=await fixture([source.reference]);await decide(f,'start');await decide(f,'request_review');await decide(f,'accept',[f.record.revisionId]);
    const racing=await fixture([source.reference]);await decide(racing,'start');await decide(racing,'request_review');
    const racingView=await readExecutionOverview(racing.reviewer,racing.engagementId),racingHead=racingView.milestones.find(m=>m.key==='proof_done')!;
    const candidate=envelope('milestone.decide',{execution:racingView.version,milestone:racingHead.version},{baselineId:racing.baselineId,milestoneKey:'proof_done',decision:'accept',evidenceRevisionIds:[racing.record.revisionId]});
    const preview=await previewExecutionCommand(racing.reviewer,racing.engagementId,candidate),requestKey=randomUUID();
    const [withdrawal,acceptance]=await Promise.allSettled([
      withTransaction(db=>submitProfileCommand(f.reviewer,f.customerId,{action:'withdraw_source',requestKey:randomUUID(),sourceRevisionId:source.sourceRevisionId,expectedLifecycleVersion:0,rationale:'Human withdrew synthetic evidence'},db)),
      submitExecutionCommand(racing.reviewer,racing.engagementId,{...candidate,...preview,requestKey,rationale:'Human acceptance racing a current source withdrawal'})
    ]);
    expect(withdrawal.status).toBe('fulfilled');
    if(acceptance.status==='rejected'){
      expect(acceptance.reason).toMatchObject({status:409});
      await withTransaction(async db=>expect((await db.query('SELECT 1 FROM execution_command_receipts WHERE request_key=$1',[requestKey])).rowCount).toBe(0));
    }
    const raced=(await readExecutionOverview(racing.reviewer,racing.engagementId)).milestones.find(m=>m.key==='proof_done')!;
    expect(raced.state).not.toBe('accepted');expect(raced.state).toBe(acceptance.status==='fulfilled'?'review_required':'ready_for_review');

    const record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records.find(r=>r.id===f.record.id)!;
    expect(record.content).toBeNull();expect(record.reviewRequired).toBe(true);
    expect((await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')?.state).toBe('review_required');
    await withTransaction(async db=>{
      expect((await db.query('SELECT 1 FROM execution_record_payloads WHERE revision_id=$1',[f.record.revisionId])).rowCount).toBe(1);
      const queued=(await db.query("SELECT source_generation,(due_at>=ineligible_at+interval '30 days') AS retained FROM execution_cleanup_jobs WHERE payload_kind='record' AND revision_id=$1",[f.record.revisionId])).rows;
      expect(queued).toHaveLength(1);expect(Number(queued[0].source_generation)).toBe(source.reference.generation);expect(queued[0].retained).toBe(true);
    });
  },180000);
});


it('allows canonical reviewer self-review while preserving explicit owner/date unknowns and the plan baseline',async()=>{
  const f=await withTransaction(db=>createExecutionBaseline(db,{plannedDate:'2026-12-01'}));
  await submitExecutionCommand(f.reviewer,f.engagementId,{...envelope('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}),requestKey:randomUUID()});
  let view=await readExecutionOverview(f.reviewer,f.engagementId);const milestone=view.milestones.find(m=>m.key==='proof_done')!;
  const original=await withTransaction(async db=>(await db.query('SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1',[f.baselineId])).rows[0].content);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...envelope('record.create',{execution:view.version},{baselineId:f.baselineId,record:{kind:'activity',subtype:'milestone_plan',title:'Explicit unknown milestone date',narrative:'Human records an unresolved date and owner.',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:null,milestoneKeys:['proof_done'],milestoneKey:'proof_done',milestoneVersion:milestone.version,ownerMembershipId:null,unknownOwnerReason:'Human assignment remains unresolved',plannedDate:null,unknownPlannedDateReason:'Human date remains unresolved',references:[]}}),requestKey:randomUUID()});
  let record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records[0];view=await readExecutionOverview(f.reviewer,f.engagementId);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...envelope('record.submit',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}),requestKey:randomUUID()});
  record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records[0];view=await readExecutionOverview(f.reviewer,f.engagementId);
  const candidate=envelope('record.accept',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest});
  const preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...preview,requestKey:randomUUID(),rationale:'Canonical reviewer explicitly reviewed own exact proposal'});
  const updated=(await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')!;
  expect(updated.state).toBe('not_started');expect(updated.plannedDate).toBeNull();expect(updated.unknownPlannedDateReason).toBe('Human date remains unresolved');expect(updated.ownerLabel).toBeNull();expect(updated.unknownOwnerReason).toBe('Human assignment remains unresolved');
  await withTransaction(async db=>{
    expect((await db.query('SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1',[f.baselineId])).rows[0].content).toEqual(original);
    const decision=(await db.query("SELECT d.actor_membership_id,p.rationale FROM execution_review_decisions d JOIN execution_review_payloads p ON p.decision_id=d.id WHERE d.revision_id=$1 AND d.action='accept'",[record.revisionId])).rows[0];
    expect(decision.actor_membership_id).toBe(f.reviewer.membershipId);expect(decision.rationale).toContain('own exact proposal');
  });
  view=await readExecutionOverview(f.reviewer,f.engagementId);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...envelope('record.create',{execution:view.version},{baselineId:f.baselineId,record:{kind:'activity',subtype:'milestone_review_request',title:'Private internal request',narrative:'PRIVATE_INTERNAL_MILESTONE_REQUEST',audience:'internal',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:null,milestoneKeys:['proof_done'],milestoneKey:'proof_done',milestoneVersion:updated.version,ownerMembershipId:null,unknownOwnerReason:'Unassigned',references:[]}}),requestKey:randomUUID()});
  record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records.at(-1)!;view=await readExecutionOverview(f.reviewer,f.engagementId);
  await submitExecutionCommand(f.reviewer,f.engagementId,{...envelope('record.submit',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}),requestKey:randomUUID()});
  record=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records.at(-1)!;view=await readExecutionOverview(f.reviewer,f.engagementId);
  await expect(previewExecutionCommand(f.reviewer,f.engagementId,envelope('record.accept',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}))).rejects.toMatchObject({status:422});
  expect((await readExecutionOverview(f.reviewer,f.engagementId)).milestones.find(m=>m.key==='proof_done')?.version).toBe(updated.version);

},180000);
