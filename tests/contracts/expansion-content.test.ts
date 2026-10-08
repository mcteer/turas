import {describe,it,expect} from 'vitest';
import {profilePayloadSchema} from '../../lib/contracts/profile-payloads';
import {expansionHypothesisSchema} from '../../lib/contracts/expansion';
import {expansionCommandSchema,expansionListSchema} from '../../lib/server/expansion/schema';
import {discoveryHypothesis} from '../fixtures/expansion';
const source='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Structured expansion contract',()=>{
 it('uses the governed original-date contract instead of accepting future observations',()=>{
  expect(profilePayloadSchema.safeParse({kind:'product_use',productKey:'synthetic-product',displayName:'Synthetic product',state:'actual',usageDescription:'Synthetic observed deployment',observedAt:new Date(Date.now()+86400000).toISOString()}).success).toBe(false);
 });
 it('rejects partial measurements, implied certainty and unsupported discriminants',()=>{
  const content=discoveryHypothesis();
  for(const benefit of [
   {kind:'measurable_target',rationale:'Proposed target',metric:'Latency',unit:'ms',target:'100',baseline:{kind:'unknown',reason:'Not measured'}},
   {kind:'qualitative_outcome',rationale:'Potential improvement'},
   {kind:'unknown'},
  ])expect(expansionHypothesisSchema.safeParse({...content,benefit}).success).toBe(false);
  expect(expansionHypothesisSchema.safeParse({...content,benefit:{kind:'measurable_target',rationale:'Proposed target',metric:'Latency',unit:'ms',target:'100',baseline:{kind:'unknown',reason:'Not measured'},validationCriterion:'Customer measurement validates target'}}).success).toBe(true);
  for(const currentUse of [{kind:'evidenced',state:'absent',sourceKeys:[source]},{kind:'evidenced',state:'actual',sourceKeys:[]},{kind:'unknown',reason:''}])
   expect(expansionHypothesisSchema.safeParse({...content,currentUse}).success).toBe(false);
 });
 it('requires attribution, exact evidence and explicit reasons in every structured branch',()=>{
  const content=discoveryHypothesis();
  for(const patch of [
   {assertions:[{purpose:'customer_need',classification:'pending_customer_assertion',text:'Unreviewed claim',sourceKeys:[source]}]},
   {assertions:[{purpose:'customer_need',classification:'accepted_fact',text:'Claim',sourceKeys:[]}]},
   {constraints:[{text:'Constraint',sourceKeys:[]}]},
   {prerequisites:[{id:'capacity',status:'satisfied',rationale:'Assumption',sourceKeys:[],unknownReason:'Not inspected'}]},
   {nextStep:{action:'Validate',validationCriterion:'Review',owner:{kind:'unknown',reason:''}}},
  ])expect(expansionHypothesisSchema.safeParse({...content,...patch}).success).toBe(false);
  expect(expansionHypothesisSchema.safeParse({...content,prerequisites:[{id:'capacity',status:'validation_needed',rationale:'Inspect capacity',sourceKeys:[],unknownReason:'Not inspected',ownerMembershipId:source,validationStep:'Measure capacity against proposed target'}]}).success).toBe(true);
 });
 it('bounds every collection and keeps control metadata out of content',()=>{
  const content=discoveryHypothesis();
  const assertion={purpose:'context',classification:'attributed_observation',text:'Attributed discovery',sourceKeys:[source]};
  const prerequisite={id:'capacity',status:'blocked',rationale:'Needs validation',sourceKeys:[],unknownReason:'Unverified'};
  for(const patch of [
   {assertions:Array.from({length:21},()=>assertion)},
   {prerequisites:Array.from({length:11},(_,i)=>({...prerequisite,id:`capacity-${i}`}))},
   {constraints:Array.from({length:11},()=>({text:'Constraint',sourceKeys:[],unknownReason:'Unknown'}))},
   {alternatives:Array.from({length:6},()=>content.alternatives[0])},
   {productVersion:'a'.repeat(101)}, {problemKey:'a'.repeat(121)}, {productKey:'a'.repeat(81)},
   {nextStep:{...content.nextStep,action:'a'.repeat(2001)}}, {ownerOverride:true},
  ])expect(expansionHypothesisSchema.safeParse({...content,...patch}).success).toBe(false);
 });
 it('rejects unsafe versions, foreign authority, oversized selection and unbounded paging',()=>{
  const command={contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:source,workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  for(const patch of [{expectedVersion:Number.MAX_SAFE_INTEGER+1},{expectedVersion:-1},{actorMembershipId:source},{selectedEngagementIds:Array.from({length:11},()=>source)}])
   expect(expansionCommandSchema.safeParse({...command,...patch}).success).toBe(false);
  for(const input of [{limit:0},{limit:51},{cursor:'a'.repeat(4097)},{revisionId:source},{recordId:source,disposition:'qualified'}])expect(expansionListSchema.safeParse(input).success).toBe(false);
 });
});
