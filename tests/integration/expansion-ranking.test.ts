import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {discoveryHypothesis} from '../fixtures/expansion';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../lib/server/expansion/projection';
describe('Expansion ranked list and cursor fences',()=>{
 let panel:CurrentSession,mcteer:CurrentSession;
 const ids:string[]=[];
 beforeAll(async()=>{
  ({panel,mcteer}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')})));
  for(let index=0;index<5;index++){
   const scope=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{});
   const content=discoveryHypothesis();content.problemKey=randomUUID();content.title=`Synthetic ranked ${index}`;
   if(index===4)content.benefit={kind:'measurable_target',rationale:'Proposed improvement',metric:'Latency',unit:'ms',target:'100',baseline:{kind:'unknown',reason:'Not measured'},validationCriterion:'Measure latency'};
   if(index===3)content.benefit={kind:'qualitative_outcome',rationale:'Proposed operating improvement',validationCriterion:'Customer validates improvement'};
   const saved=await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),expectedVersion:scope.scopeGeneration,content,sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});ids.push(saved.recordId!);
  }
 },60000);
 it('ranks the complete candidate set before paging, with no omissions or duplicates',async()=>{
  const first=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2});
  expect(first.records.map(record=>record.id)).toEqual([ids[4],ids[3]]);expect(first.nextCursor).not.toBeNull();
  const second=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2,cursor:first.nextCursor});
  const third=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2,cursor:second.nextCursor});
  expect(third.nextCursor).toBeNull();expect(new Set([...first.records,...second.records,...third.records].map(record=>record.id)).size).toBe(5);
  expect(first.records[0].ranking.categories).toMatchObject({benefit:'measurable_target',evidence:'discovery_only'});
 });
 it('rejects actor, filter, page-size and generation changes rather than mixing pages',async()=>{
  const first=await readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2});
  await expect(readExpansionWorkspace(mcteer,DEMO_IDS.sharedCustomer,{limit:2,cursor:first.nextCursor})).rejects.toMatchObject({status:409});
  await expect(readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:3,cursor:first.nextCursor})).rejects.toMatchObject({status:409});
  await expect(readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2,disposition:'dismissed',cursor:first.nextCursor})).rejects.toMatchObject({status:409});
  const record=first.records[0];
  await saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),recordId:record.id,expectedVersion:record.version,content:{...record.working.payload!.content,title:'Synthetic changed ranked revision'},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  await expect(readExpansionWorkspace(panel,DEMO_IDS.sharedCustomer,{limit:2,cursor:first.nextCursor})).rejects.toMatchObject({status:409});
 });
});
