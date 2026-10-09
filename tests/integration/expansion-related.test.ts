import {getServerConfig} from '../../lib/server/config';
import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {discoveryHypothesis} from '../fixtures/expansion';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../lib/server/expansion/projection';
import {readExpansionRelated} from '../../lib/server/expansion/related';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {createExpansionPreview,decideExpansionHypothesis} from '../../lib/server/expansion/review';
describe('Expansion explicit related identity comparison',()=>{
 let panel:CurrentSession,mcteer:CurrentSession,partner:CurrentSession;
 beforeAll(async()=>{({panel,mcteer,partner}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer'),partner:await createProfileTestSession(db,'partner')})));});
 it('retains dismissed opaque identity after prose purge and requires the exact related set',async()=>{
  const content=discoveryHypothesis(),customerId=DEMO_IDS.sharedCustomer;
  await assignExpansionOwner(mcteer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:panel.membershipId,rationale:'Synthetic explicit comparison owner'});
  const base={contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,content,sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  const first=await saveExpansionProposal(panel,customerId,{...base,expectedVersion:0,requestKey:randomUUID()});
  const preview=await createExpansionPreview(panel,customerId,{workloadId:null,recordId:first.recordId,revisionId:first.revisionId,kind:'full'});
  await decideExpansionHypothesis(panel,customerId,{contractVersion:'expansion-v1',operation:'decide_hypothesis',workloadId:null,requestKey:randomUUID(),recordId:first.recordId,revisionId:first.revisionId,expectedVersion:first.version,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'dismiss',rationale:'Synthetic decision retains current practice'});
  await withExpansionDatabase(db=>db.query('DELETE FROM expansion_payloads WHERE revision_id=$1',[first.revisionId]));
  const comparison=await readExpansionRelated(panel,customerId,{productKey:content.productKey,problemKey:content.problemKey});
  expect(comparison.records).toEqual([{id:first.recordId,version:2,disposition:'dismissed',title:null}]);
  const scope=await readExpansionWorkspace(panel,customerId,{});expect(scope.records).toHaveLength(0);
  await expect(saveExpansionProposal(panel,customerId,{...base,expectedVersion:scope.scopeGeneration,requestKey:randomUUID()})).rejects.toMatchObject({status:409,code:'duplicate_hypothesis'});
  const second=await saveExpansionProposal(panel,customerId,{...base,content:{...content,title:'Synthetic distinct validation'},expectedVersion:scope.scopeGeneration,requestKey:randomUUID(),duplicateAcknowledgement:{relatedSetDigest:comparison.relatedSetDigest,rationale:'Different validation boundary with independently reviewed benefit'}});
  expect(second.outcome).toBe('proposed');
  const changed=await readExpansionWorkspace(panel,customerId,{});
  await expect(saveExpansionProposal(panel,customerId,{...base,expectedVersion:changed.scopeGeneration,requestKey:randomUUID(),duplicateAcknowledgement:{relatedSetDigest:comparison.relatedSetDigest,rationale:'Previously reviewed comparison is no longer current'}})).rejects.toMatchObject({status:409,code:'duplicate_hypothesis'});
  const thirdComparison=await readExpansionRelated(panel,customerId,{productKey:content.productKey,problemKey:content.problemKey});expect(thirdComparison.records).toHaveLength(2);expect(thirdComparison.relatedSetDigest).not.toBe(comparison.relatedSetDigest);
  await expect(readExpansionRelated(partner,customerId,{productKey:content.productKey,problemKey:content.problemKey})).rejects.toMatchObject({status:404});
 },60000);
 it('keeps old opaque identities visible across key rotation and serializes concurrent distinct additions',async()=>{
  const customerId=DEMO_IDS.sharedCustomer,content=discoveryHypothesis(),original=process.env.TURAS_011_RECEIPT_HASH_KEYS;
  try{process.env.TURAS_011_RECEIPT_HASH_KEYS=JSON.stringify(['synthetic-011-new-duplicate-key-32-characters-minimum',getServerConfig().TURAS_MAINTENANCE_SECRET]);
   const comparison=await readExpansionRelated(panel,customerId,{productKey:content.productKey,problemKey:content.problemKey});expect(comparison.records).toHaveLength(2);expect(comparison.records.some(record=>record.disposition==='dismissed'&&record.title===null)).toBe(true);
   const scope=await readExpansionWorkspace(panel,customerId,{}),base={contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,expectedVersion:scope.scopeGeneration,sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[],duplicateAcknowledgement:{relatedSetDigest:comparison.relatedSetDigest,rationale:'Explicitly distinct validation boundary after current comparison'}};
   const results=await Promise.allSettled(['A','B'].map(suffix=>saveExpansionProposal(panel,customerId,{...base,requestKey:randomUUID(),content:{...content,title:`Synthetic concurrent distinct ${suffix}`}})));
   expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);const rejected=results.find(result=>result.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason).toMatchObject({status:409});
   const related=await readExpansionRelated(panel,customerId,{productKey:content.productKey,problemKey:content.problemKey});expect(related.records).toHaveLength(3);expect(related.records.filter(record=>record.disposition==='dismissed')).toHaveLength(1);
  }finally{if(original===undefined)delete process.env.TURAS_011_RECEIPT_HASH_KEYS;else process.env.TURAS_011_RECEIPT_HASH_KEYS=original;}
 },60000);

});
