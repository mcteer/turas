import {describe,it,expect} from 'vitest';
import {rankExpansion,compareExpansionRanking,type ExpansionRankingInput} from '../../lib/expansion/ranking';
import {discoveryHypothesis} from '../fixtures/expansion';
const base:ExpansionRankingInput={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',createdAt:'2026-01-01T00:00:00.000Z',disposition:'proposed',reviewRequired:false,content:discoveryHypothesis(),qualificationSupported:false,revisitDate:null,decisionAt:null};
const ranked=(patch:Partial<ExpansionRankingInput>)=>rankExpansion({...base,...patch});
describe('Expansion categorical ordering v1',()=>{
 it('places required review before benefit specificity and preserves blocked reasons',()=>{
  const measurable={kind:'measurable_target' as const,rationale:'Proposed benefit',metric:'Latency',unit:'ms',target:'100',baseline:{kind:'unknown' as const,reason:'Not measured'},validationCriterion:'Measure request latency'};
  expect(compareExpansionRanking(ranked({reviewRequired:true}),ranked({content:{...base.content!,benefit:measurable}}))).toBeLessThan(0);
  const blocked=ranked({content:{...base.content!,benefit:measurable,prerequisites:[{id:'capacity',status:'blocked',rationale:'Unverified capacity',sourceKeys:[],unknownReason:'Needs validation'}]}});
  expect(blocked.kind==='active'&&blocked.categories.prerequisite).toBe('blocked');
  expect(compareExpansionRanking(blocked,ranked({}))).toBeLessThan(0);
 });
 it('orders every benefit, prerequisite and evidence category lexicographically',()=>{
  const qualitative={...base.content!,benefit:{kind:'qualitative_outcome' as const,rationale:'Proposed operating improvement',validationCriterion:'Customer validates outcome'}};
  const satisfied=ranked({content:qualitative,qualificationSupported:true});
  const validation=ranked({content:{...qualitative,prerequisites:[{id:'capacity',status:'validation_needed',rationale:'Inspect capacity',sourceKeys:[],unknownReason:'Unknown',ownerMembershipId:base.id,validationStep:'Measure capacity'}]},qualificationSupported:true});
  const blocked=ranked({content:{...qualitative,prerequisites:[{id:'capacity',status:'blocked',rationale:'Insufficient capacity',sourceKeys:[],unknownReason:'Unknown'}]},qualificationSupported:true});
  expect(compareExpansionRanking(satisfied,validation)).toBeLessThan(0);expect(compareExpansionRanking(validation,blocked)).toBeLessThan(0);
  expect(compareExpansionRanking(satisfied,ranked({content:qualitative}))).toBeLessThan(0);expect(compareExpansionRanking(ranked({content:qualitative}),ranked({}))).toBeLessThan(0);
 });
 it('uses only unknown rank inputs when content is withheld, regardless of cached support flags',()=>{
  const unavailable=ranked({content:null,qualificationSupported:true});
  expect(unavailable.kind==='active'&&unavailable.categories).toMatchObject({benefit:'unknown',prerequisite:'unknown',evidence:'unavailable',nextReviewDate:null});
  expect(compareExpansionRanking(ranked({}),unavailable)).toBeLessThan(0);
 });
 it('breaks active ties by review date, immutable creation time and UUID',()=>{
  expect(compareExpansionRanking(ranked({content:{...base.content!,nextReviewDate:'2026-01-01'}}),ranked({content:{...base.content!,nextReviewDate:'2026-01-02'}}))).toBeLessThan(0);
  expect(compareExpansionRanking(ranked({createdAt:'2025-12-31T00:00:00.000Z'}),ranked({}))).toBeLessThan(0);
  expect(compareExpansionRanking(ranked({}),ranked({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}))).toBeLessThan(0);
  expect(compareExpansionRanking(ranked({}),ranked({}))).toBe(0);
 });
 it('keeps paused ordering separate and uses revisit date, decision time and UUID',()=>{
  const deferred=ranked({disposition:'deferred',revisitDate:'2026-01-01',decisionAt:'2025-12-30T00:00:00.000Z'});
  expect(compareExpansionRanking(deferred,ranked({disposition:'deferred',revisitDate:null}))).toBeLessThan(0);
  expect(compareExpansionRanking(deferred,ranked({disposition:'deferred',revisitDate:'2026-01-01',decisionAt:'2025-12-31T00:00:00.000Z'}))).toBeLessThan(0);
  expect(()=>compareExpansionRanking(deferred,ranked({}))).toThrow();
 });
});
