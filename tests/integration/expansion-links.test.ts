import {submitPlanCommand} from '../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../lib/server/plans/decisions';
import {withTransaction} from '../../lib/server/db/client';
import {readExpansionDeliveryChoices} from '../../lib/server/expansion/link-choices';
import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createExpansionDeliveryBaseline} from '../fixtures/expansion/delivery';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {discoveryHypothesis} from '../fixtures/expansion';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../lib/server/expansion/projection';
import {acceptedExpansionEvidence} from '../fixtures/expansion/evidence';
import {submitProfileCommand} from '../../lib/server/profiles/service';
describe('Expansion exact delivery links',()=>{
 let panel:CurrentSession,mcteer:CurrentSession;
 beforeAll(async()=>{({panel,mcteer}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')})));});
 it('links an accepted plan and selected current baseline without changing either domain',async()=>{
  const delivery=await withTransaction(db=>createExpansionDeliveryBaseline(db));
  const choices=await readExpansionDeliveryChoices(panel,DEMO_IDS.sharedCustomer,{});expect(choices.plans.some(plan=>plan.revisionId===delivery.created.revisionId)).toBe(true);expect(choices.engagements.some(engagement=>engagement.baselineId===delivery.baselineId)).toBe(true);
  const before=await withExpansionDatabase(async db=>(await db.query('SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1',[delivery.created.planId])).rows[0]);
  const command={contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[delivery.engagementId],deliveryLinks:[
   {kind:'plan_revision',planId:delivery.created.planId,revisionId:delivery.created.revisionId},
   {kind:'engagement',engagementId:delivery.engagementId,baselineId:delivery.baselineId,generation:1},
   {kind:'milestone_baseline',engagementId:delivery.engagementId,baselineId:delivery.baselineId,revisionId:delivery.created.revisionId}]};
  const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,command);
  expect((await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{recordId:saved.recordId})).records[0].working.payload?.deliveryLinks).toEqual(command.deliveryLinks);
  const after=await withExpansionDatabase(async db=>(await db.query('SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1',[delivery.created.planId])).rows[0]);expect(after).toEqual(before);
  await expect(saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{...command,requestKey:randomUUID(),expectedVersion:1,selectedEngagementIds:[],content:{...command.content,problemKey:randomUUID()}})).rejects.toMatchObject({status:404});
  await expect(saveExpansionProposal(panel,DEMO_IDS.deniedCustomer,{...command,requestKey:randomUUID()})).rejects.toMatchObject({status:404});
  await expect(saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{...command,requestKey:randomUUID(),expectedVersion:1,content:{...command.content,problemKey:randomUUID()},deliveryLinks:[{kind:'engagement',engagementId:delivery.engagementId,baselineId:delivery.baselineId,generation:2}]})).rejects.toMatchObject({status:409});
  await withTransaction(async db=>{
   const updated=await submitPlanCommand(panel,{action:'save',requestKey:randomUUID(),planId:delivery.created.planId,expectedAggregateVersion:Number(before.aggregate_version),parentRevisionId:delivery.created.revisionId,baseAcceptedRevisionId:delivery.created.revisionId,changeReason:'Synthetic explicitly reviewed baseline replacement',content:{...delivery.content,title:'Synthetic replacement baseline',asOf:new Date(Date.now()-1000).toISOString()}},db);
   const submitted=await submitPlanCommand(panel,{action:'submit',requestKey:randomUUID(),planId:updated.planId,revisionId:updated.revisionId,contentDigest:updated.contentDigest,expectedAggregateVersion:updated.aggregateVersion},db);
   const preview=await createPlanReviewPreview(mcteer,updated.planId,{requestKey:randomUUID(),revisionId:updated.revisionId,contentDigest:updated.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},db);
   await decidePlan(mcteer,updated.planId,{action:'accept',requestKey:randomUUID(),revisionId:updated.revisionId,contentDigest:updated.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Human accepts the exact synthetic replacement',deliverySuitabilityConfirmed:true},db);
  });
  expect((await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{recordId:saved.recordId})).records[0].working.payload).toBeNull();
  await withExpansionDatabase(async db=>expect((await db.query('SELECT 1 FROM expansion_invalidations WHERE revision_id=$1',[saved.revisionId])).rowCount).toBe(1));

 },60000);
 it('withholds the linked hypothesis when a transitive original is withdrawn, without maintenance',async()=>{
  const original=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,null,'Synthetic delivery-link original evidence.',`synthetic-original-${randomUUID()}`,'adoption_process');
  const delivery=await withTransaction(db=>createExpansionDeliveryBaseline(db,{sources:[original.reference]}));
  const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{});
  const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),expectedVersion:scope.scopeGeneration,content:{...discoveryHypothesis(),problemKey:randomUUID()},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[{kind:'plan_revision',planId:delivery.created.planId,revisionId:delivery.created.revisionId}]});
  await withExpansionDatabase(async db=>expect((await db.query('SELECT 1 FROM expansion_dependencies WHERE revision_id=$1 AND source_revision_id=$2',[saved.revisionId,original.reviewedRevisionId])).rowCount).toBe(1));
  const version=await withExpansionDatabase(async db=>Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[original.reviewedRevisionId])).rows[0].version));
  await submitProfileCommand(mcteer,DEMO_IDS.sharedCustomer,{action:'retract_revision',requestKey:randomUUID(),revisionId:original.reviewedRevisionId,expectedRecordVersion:version,rationale:'Synthetic withdrawal of a transitive original'});
  const choices=await readExpansionDeliveryChoices(panel,DEMO_IDS.sharedCustomer,{});expect(choices.plans.some(plan=>plan.revisionId===delivery.created.revisionId)).toBe(false);
  const view=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{recordId:saved.recordId});expect(view.records[0].working.payload).toBeNull();expect(view.records[0].ranking.kind==='active'&&view.records[0].ranking.categories.evidence).toBe('unavailable');
 },60000);
});
