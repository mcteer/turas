import {describe,it,expect} from 'vitest';
import {expansionRecordProjectionSchema,expansionReceiptSchema,expansionRevisionProjectionSchema,expansionRetainedPayloadSchema} from '../../lib/server/expansion/projection-schema';
import {discoveryHypothesis} from '../fixtures/expansion';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Expansion output boundaries',()=>{
 it('keeps withheld projections free of cached prose and strict extra properties',()=>{
  const payload={content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  expect(expansionRevisionProjectionSchema.safeParse({availability:'changed',payload}).success).toBe(false);
  expect(expansionRevisionProjectionSchema.safeParse({availability:'eligible',payload:null}).success).toBe(false);
  expect(expansionRevisionProjectionSchema.safeParse({availability:'eligible',payload}).success).toBe(true);
  expect(expansionRevisionProjectionSchema.safeParse({availability:'changed',payload:null,staleTitle:'Cached private title'}).success).toBe(false);
  expect(expansionRetainedPayloadSchema.safeParse({...payload,accepted:true}).success).toBe(false);
 });
 it('rejects unsafe metadata and cannot describe a save as qualified',()=>{
  const receipt={id,operation:'save_hypothesis',customerId:id,recordId:id,revisionId:id,decisionId:null,outcome:'proposed',version:1};
  expect(expansionReceiptSchema.safeParse(receipt).success).toBe(true);
  for(const patch of [{version:Number.MAX_SAFE_INTEGER+1},{outcome:'qualified'},{prose:'Receipt cannot retain prose'}])expect(expansionReceiptSchema.safeParse({...receipt,...patch}).success).toBe(false);
 });
 it('cannot release cached benefit or prerequisite rank inputs with withheld content',()=>{
  const createdAt='2026-01-01T00:00:00.000Z',record={id,version:1,workingRevisionId:id,decidedRevisionId:null,disposition:'proposed',createdAt,lastDecision:null,working:{availability:'changed',payload:null},decided:{availability:'missing',payload:null},reviewRequired:true,reviewReasons:[],allowedActions:[],history:null,ranking:{version:'expansion-ranking-v1',kind:'active',categories:{review:'required',benefit:'unknown',prerequisite:'unknown',evidence:'unavailable',nextReviewDate:null},tuple:[0,2,3,2,'9999-12-31',createdAt,id]}};
  expect(expansionRecordProjectionSchema.safeParse(record).success).toBe(true);
  for(const patch of [{benefit:'measurable_target'},{prerequisite:'satisfied'},{evidence:'qualification_supported'},{nextReviewDate:'2026-01-01'}])expect(expansionRecordProjectionSchema.safeParse({...record,ranking:{...record.ranking,categories:{...record.ranking.categories,...patch}}}).success).toBe(false);
 });

});
