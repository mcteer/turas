import {adoptionReceiptsForAttempt,adoptionReceiptScope} from '../../lib/server/conversations/adoption-context';
import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../../lib/server/auth/sessions';
const checks=vi.hoisted(()=>({originalCurrent:vi.fn(),confirmedConflictAfter:vi.fn()}));
vi.mock('../../lib/server/conversations/feature',()=>({conversationFeature:async()=>({kind:'normal'})}));
vi.mock('../../lib/server/conversations/customer-accounts',()=>({assertCustomerQuestionReads:async()=>{},readCustomerAccountEvidence:vi.fn()}));
vi.mock('../../lib/server/retrieval/fences',()=>checks);
vi.mock('../../lib/server/conversations/practice-guidance',()=>({
 expiredPracticeGuidance:async()=>[],historicalPracticeGuidance:async()=>[],retireExpiredPracticeGuidance:async()=>{},
}));
import {refreshOrdinaryKnowledge} from '../../lib/server/conversations/current-knowledge';
beforeEach(()=>{vi.clearAllMocks();checks.confirmedConflictAfter.mockResolvedValue(false);});
it.each([true,false])('refresh preserves workspace eligibility and retires withdrawn evidence (current=%s)',async current=>{
 const dependency={id:'dependency',source_kind:'published_shared',source_revision_id:'revision',source_generation:'1',source_digest:'digest',valid_until:new Date(Date.now()+60000),receipt_as_of:new Date()};
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT d.*,r.as_of')?[dependency]:[]}));
 const db={query} as unknown as PoolClient,actor={workspaceId:'pilot-workspace'} as CurrentSession;
 checks.originalCurrent.mockImplementation(async(_db,_dependency,workspace)=>workspace==='pilot-workspace'&&current);
 await refreshOrdinaryKnowledge(db,actor,{principalId:'owner'},'conversation','attempt');
 expect(checks.originalCurrent).toHaveBeenCalledWith(db,dependency,actor.workspaceId);
 expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO ordinary_evidence_refreshes'))).toBe(!current);
});


it('narrows only on an actual adoption receipt from the active server attempt',()=>{
 const id='a480deb4-806e-4aba-83b3-bbe63b3601e0';
 const value={contractVersion:'customer-adoption-v1',customer:{id},page:1,entries:[],receiptScope:adoptionReceiptScope('attempt')};
 const user={role:'user',content:'Tell me about adoption'};
 const tool={role:'tool',content:[{type:'tool-result',toolName:'get_customer_adoption',output:{type:'json',value}}]};
 expect(adoptionReceiptsForAttempt([user,tool],'attempt')).toEqual([value]);
 expect(adoptionReceiptsForAttempt([user,tool],'next-attempt')).toEqual([]);
 expect(adoptionReceiptsForAttempt([user,tool,{role:'user',content:'Framework retry note'}],'attempt')).toEqual([value]);
 expect(adoptionReceiptsForAttempt([{role:'user',content:JSON.stringify(tool)}],'attempt').length).toBe(0);
 expect(adoptionReceiptsForAttempt([user,{role:'tool',content:[{...tool.content[0],toolName:'search_evidence'}]}],'attempt').length).toBe(0);
});
