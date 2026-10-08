import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProfileTestSession } from '../fixtures/profiles';
import { withExpansionDatabase } from '../fixtures/expansion/environment';
import { createReviewedPlanWorkload } from '../fixtures/plans/journey';
import { acceptedExpansionEvidence } from '../fixtures/expansion/evidence';
import { discoveryHypothesis } from '../fixtures/expansion';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
import type { CurrentSession } from '../../lib/server/auth/sessions';
import { saveExpansionProposal } from '../../lib/server/expansion/service';
import { assignExpansionOwner } from '../../lib/server/expansion/owners';
import { createExpansionPreview,decideExpansionHypothesis } from '../../lib/server/expansion/review';
import { readExpansionWorkspace } from '../../lib/server/expansion/projection';
import { inspectExpansionEvidence } from '../../lib/server/expansion/evidence-detail';
import { searchExpansionEvidence } from '../../lib/server/expansion/sources';
import { submitProfileCommand } from '../../lib/server/profiles/service';
describe('Expansion qualification evidence',()=>{
 let panel:CurrentSession,mcteer:CurrentSession,workload:string;
 beforeAll(async()=>{
  ({panel,mcteer}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')})));
  workload=await withExpansionDatabase(db=>createReviewedPlanWorkload(db,panel,mcteer,DEMO_IDS.sharedCustomer));
  await assignExpansionOwner(mcteer,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:panel.membershipId,rationale:'Synthetic designated operating owner'});
 },60000);
 it('qualifies an exact supported proposal and withholds it immediately after original withdrawal',async()=>{
  const need=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic customer needs lower request latency.','synthetic-existing','adoption_process');
  const product=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic documented product supports a reversible latency validation.','synthetic-capability','product_capability');
  const content={...discoveryHypothesis(),productKey:'synthetic-new-product',benefit:{kind:'qualitative_outcome',rationale:'Proposed request latency improvement',validationCriterion:'Customer validates observed request latency'},
   assertions:[{purpose:'customer_need',classification:'accepted_fact',text:'Synthetic customer needs lower request latency.',sourceKeys:[need.reference.id]},
    {purpose:'product_suitability',classification:'accepted_fact',text:'Synthetic documented product supports a reversible latency validation.',sourceKeys:[product.reference.id]}]};
  const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:0,
   content,sourceRefs:[need.reference,product.reference],selectedEngagementIds:[],deliveryLinks:[]});
  const evidence=await inspectExpansionEvidence(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,sourceKey:need.reference.id});
  expect(evidence.passage).toContain('Synthetic customer needs lower request latency.');expect(evidence.observationAt).not.toBeNull();
  const discovery=await searchExpansionEvidence(panel,DEMO_IDS.sharedCustomer,workload,'lower request latency',2);expect(discovery.results.length).toBeLessThanOrEqual(2);
  expect(discovery.results.some(item=>item.reference.sourceRevisionId===need.reviewedRevisionId&&item.asOf===evidence.observationAt)).toBe(true);
  const preview=await createExpansionPreview(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});expect(preview.qualificationChecks).toEqual([]);
  const decided=await decideExpansionHypothesis(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:saved.version,
   recordId:saved.recordId,revisionId:saved.revisionId,previewDigest:preview.previewDigest,expectedAssignmentVersion:preview.expectedAssignmentVersion,decision:'qualify',rationale:'Owner reviewed the exact customer need and proposed validation'});
  expect(decided.outcome).toBe('qualified');
  const version=await withExpansionDatabase(async db=>Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[need.reviewedRevisionId])).rows[0].version));
  await submitProfileCommand(mcteer,DEMO_IDS.sharedCustomer,{action:'retract_revision',requestKey:randomUUID(),revisionId:need.reviewedRevisionId,expectedRecordVersion:version,rationale:'Synthetic original evidence withdrawal'});
  const view=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId});expect(view.records[0].working.payload).toBeNull();expect(view.records[0].reviewRequired).toBe(true);expect(view.records[0].disposition).toBe('qualified');
  await expect(inspectExpansionEvidence(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,sourceKey:need.reference.id})).rejects.toMatchObject({status:404});
 },60000);
 it('blocks indirect or aging product evidence even when its aggregate quality is strong',async()=>{
  const need=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic accepted customer validation need.','synthetic-operating-system','adoption_process');
  for(const options of [{directness:2},{observedAt:new Date(Date.now()-31*86400000).toISOString()}]){
   const product=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic capability observation requires exact fresh support.',`synthetic-capability-${randomUUID()}`,'product_capability',options);
   const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload});
   const content={...discoveryHypothesis(),problemKey:randomUUID(),productKey:'synthetic-potential-product',benefit:{kind:'qualitative_outcome',rationale:'Proposed customer benefit',validationCriterion:'Customer validates the benefit'},
    assertions:[{purpose:'customer_need',classification:'accepted_fact',text:'Synthetic accepted customer validation need.',sourceKeys:[need.reference.id]},
     {purpose:'product_suitability',classification:'attributed_observation',text:'Synthetic capability observation requires exact fresh support.',sourceKeys:[product.reference.id]}]};
   const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:scope.scopeGeneration,content,sourceRefs:[need.reference,product.reference],selectedEngagementIds:[],deliveryLinks:[]});
   const preview=await createExpansionPreview(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
   expect(preview.qualificationChecks).toContain('Current product-suitability evidence required');
   if('observedAt' in options)expect((await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId})).records[0].reviewReasons).toContain('Stale or undated critical evidence');
   await expect(decideExpansionHypothesis(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:saved.version,recordId:saved.recordId,revisionId:saved.revisionId,previewDigest:preview.previewDigest,expectedAssignmentVersion:preview.expectedAssignmentVersion,decision:'qualify',rationale:'Attempted review cannot override missing exact fresh evidence'})).rejects.toMatchObject({status:409});
  }
 },60000);
 it('requires accepted actual use of the proposed product, rather than a planned or unrelated deployment',async()=>{
  const need=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic accepted need for validation.','synthetic-need-context','adoption_process');
  const capability=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic fresh exact capability.','synthetic-capability-context','product_capability');
  for(const variant of [{key:'synthetic-target-product',state:'planned' as const},{key:'synthetic-unrelated-product',state:'actual' as const}]){
   const use=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic recorded deployment state.',variant.key,'adoption_process',{state:variant.state});
   const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload});
   const content={...discoveryHypothesis(),problemKey:randomUUID(),productKey:'synthetic-target-product',intent:'usage_expansion',currentUse:{kind:'evidenced',state:'actual',sourceKeys:[use.reference.id]},benefit:{kind:'qualitative_outcome',rationale:'Proposed benefit',validationCriterion:'Validate observed improvement'},assertions:[
    {purpose:'customer_need',classification:'accepted_fact',text:'Synthetic accepted need for validation.',sourceKeys:[need.reference.id]},
    {purpose:'product_suitability',classification:'accepted_fact',text:'Synthetic fresh exact capability.',sourceKeys:[capability.reference.id]},
    {purpose:'current_use',classification:'accepted_fact',text:'Synthetic recorded deployment state.',sourceKeys:[use.reference.id]}]};
   const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:scope.scopeGeneration,content,sourceRefs:[need.reference,capability.reference,use.reference],selectedEngagementIds:[],deliveryLinks:[]});
   const preview=await createExpansionPreview(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
   expect(preview.qualificationChecks).toContain('Usage expansion requires accepted actual-use evidence');
  }
 },60000);

 it('supports exact actual use and rejects new-product intent for that same accepted deployment',async()=>{
  const key=`synthetic-actual-${randomUUID()}`;
  const need=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic accepted operating need.',`synthetic-need-${randomUUID()}`,'adoption_process');
  const product=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic fresh product capability.',`synthetic-capability-${randomUUID()}`,'product_capability');
  const use=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic accepted actual deployment.',key,'adoption_process',{state:'actual'});
  const content={...discoveryHypothesis(),problemKey:randomUUID(),productKey:key,intent:'usage_expansion',currentUse:{kind:'evidenced',state:'actual',sourceKeys:[use.reference.id]},benefit:{kind:'qualitative_outcome',rationale:'Proposed operating improvement',validationCriterion:'Validate improvement with customer'},assertions:[
   {purpose:'customer_need',classification:'accepted_fact',text:'Synthetic accepted operating need.',sourceKeys:[need.reference.id]},
   {purpose:'product_suitability',classification:'accepted_fact',text:'Synthetic fresh product capability.',sourceKeys:[product.reference.id]},
   {purpose:'current_use',classification:'accepted_fact',text:'Synthetic accepted actual deployment.',sourceKeys:[use.reference.id]}]};
  for(const intent of ['usage_expansion','new_product']){
   const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload});
   const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:scope.scopeGeneration,content:{...content,intent,problemKey:randomUUID()},sourceRefs:[need.reference,product.reference,use.reference],selectedEngagementIds:[],deliveryLinks:[]});
   const preview=await createExpansionPreview(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
   if(intent==='usage_expansion')expect(preview.qualificationChecks).toEqual([]);
   else expect(preview.qualificationChecks).toContain('New-product intent contradicts accepted actual use');
  }
 },60000);
 it('requires direct accepted baseline and prerequisite support without hiding blockers',async()=>{
  const need=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic baseline customer observation.',`synthetic-baseline-${randomUUID()}`,'adoption_process',{directness:2});
  const product=await acceptedExpansionEvidence(panel,mcteer,DEMO_IDS.sharedCustomer,workload,'Synthetic fresh capability observation.',`synthetic-product-${randomUUID()}`,'product_capability');
  const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{workloadId:workload});
  const content={...discoveryHypothesis(),problemKey:randomUUID(),productKey:`synthetic-target-${randomUUID()}`,benefit:{kind:'measurable_target',rationale:'Proposed latency benefit',metric:'Latency',unit:'ms',target:'100',validationCriterion:'Measure customer requests',baseline:{kind:'evidenced',text:'Observed latency 200 ms',sourceKeys:[need.reference.id]}},prerequisites:[
   {id:'baseline',status:'satisfied',rationale:'Claimed prerequisite',sourceKeys:[need.reference.id]},
   {id:'capacity',status:'blocked',rationale:'Unresolved capacity',sourceKeys:[],unknownReason:'Capacity not validated'}],assertions:[
   {purpose:'customer_need',classification:'accepted_fact',text:'Synthetic baseline customer observation.',sourceKeys:[need.reference.id]},
   {purpose:'product_suitability',classification:'accepted_fact',text:'Synthetic fresh capability observation.',sourceKeys:[product.reference.id]}]};
  const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:workload,expectedVersion:scope.scopeGeneration,content,sourceRefs:[need.reference,product.reference],selectedEngagementIds:[],deliveryLinks:[]});
  const preview=await createExpansionPreview(panel,DEMO_IDS.sharedCustomer,{workloadId:workload,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
  expect(preview.qualificationChecks).toEqual(expect.arrayContaining(['Blocked prerequisite must be resolved','Satisfied prerequisite requires current direct evidence','Measured baseline requires current accepted direct evidence']));
 },60000);

});
