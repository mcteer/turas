import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../../lib/server/auth/sessions';
const checks=vi.hoisted(()=>({originalCurrent:vi.fn(),confirmedConflictAfter:vi.fn()}));
vi.mock('../../lib/server/conversations/feature',()=>({conversationFeature:async()=>({kind:'normal'})}));
vi.mock('../../lib/server/conversations/customer-accounts',()=>({assertCustomerQuestionReads:async()=>{},readCustomerAccountEvidence:vi.fn()}));
vi.mock('../../lib/server/retrieval/fences',()=>checks);
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
