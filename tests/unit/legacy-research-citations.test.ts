import {it,expect} from 'vitest';
import {customerResearchCitations} from '../../lib/server/research/specialists/solution-research/citations';
import {context} from '../fixtures/legacy-specialist-contracts';
it('cites the encoded current customer destination without invented record anchors',()=>{
 const evidence={...context.evidence[0],id:'journal:actual-record:r2',basis:'approved_customer_record' as const,source:'A meeting note without a URL'};
 expect(customerResearchCitations({...context,accountId:'account/with boundary',evidence:[evidence]})).toEqual([{citationId:'C1',evidenceId:evidence.id,title:evidence.title,observedAt:evidence.observedAt,href:'/customers/account%2Fwith%20boundary'}]);
});
it('copies public URLs byte-for-byte and leaves unsafe or fictional references unlinked',()=>{
 const base=context.evidence[0], exact='https://vercel.com/customers/example?view=a%2Fb#original';
 const evidence=[{...base,id:'public:1',basis:'reviewed_public_snapshot' as const,source:exact},{...base,id:'checked:1',basis:'checked_public_research' as const,source:exact},...['Fictional scenario','javascript:alert(1)','https://name:secret@example.com/page','http://example.com/page'].map((source,i)=>({...base,id:`reference:${i}`,source,basis:i===0?'fictional_scenario' as const:'reviewed_public_snapshot' as const}))];
 const citations=customerResearchCitations({...context,evidence});
 expect(citations.map(c=>c.href)).toEqual([exact,exact,null,null,null,null]);expect(citations.map(c=>c.citationId)).toEqual(['C1','C2','C3','C4','C5','C6']);expect(citations.map(c=>c.evidenceId)).toEqual(evidence.map(e=>e.id));
});
