import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withMcpConsumer } from '../../fixtures/mcp/consumer';
import { createMcpConnection } from '../../../lib/server/mcp/management';
import { materializeCurrentProjection } from '../../../lib/server/retrieval/projections';
import { mcpToolOutputs } from '../../../lib/contracts/mcp';
import { mcpPublishedKnowledge } from '../../fixtures/mcp/knowledge';
import { ingestVerifiedResearch } from '../../../lib/server/profiles/research';
describe('MCP real consumer context parity',()=>{
  it('reads current profiles, passages and credential-bound citations and rejects withdrawn prose',async()=>withMcpDatabase(async db=>{
    const {browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const fact=await mcpAcceptedFact(db,browser,reviewer,customerId);
    const practice=await mcpPublishedKnowledge(db,browser,reviewer,customerId);
    await materializeCurrentProjection(db,'accepted_profile',fact.revisionId,'internal');
    const at=new Date(Date.now()-1000).toISOString(),research=await ingestVerifiedResearch({
      workspaceId:browser.workspaceId,customerId,trustedIdentity:'synthetic-fixture-v1',
      location:'https://synthetic.invalid/mcp-research',title:'Synthetic current research',
      passage:'Synthetic independently checked research passage.',supportedClaim:'Synthetic research only',
      observationAt:at,retrievalAt:at,rights:'Synthetic public fixture',audience:'internal',
      qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Synthetic original',
        directnessRationale:'Exact synthetic passage',corroborationRationale:'Synthetic independent check',
        informationType:'adoption_process',dateBasis:'observation'},
      checks:{identity:true,scope:true,integrity:true,content:true,rationale:'Synthetic independently verified fixture',checkVersion:'research-check-v1'},
    },db);
    await materializeCurrentProjection(db,'verified_research',research.sourceRevisionId,'internal');
    const created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic context consumer',categories:['profiles','evidence','knowledge'],customerIds:[customerId],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('No synthetic credential');
    await withMcpConsumer(process.env.TURAS_APP_ORIGIN!,created.credential,async client=>{
      for(const arguments_ of [{customerId:randomUUID(),section:'summary'},{customerId,section:'invalid'}]){
        const denied=await client.callTool({name:'turas_profile_read_v1',arguments:arguments_});
        expect(denied.isError).toBe(true);
        expect(denied.content).toEqual([{type:'text',text:'Request unavailable'}]);expect(denied.structuredContent).toBeUndefined();
      }
      const customers=mcpToolOutputs.turas_customers_list_v1.parse((await client.callTool({name:'turas_customers_list_v1',arguments:{limit:20}})).structuredContent);
      expect(customers.status).toBe('available');if(customers.status==='available')expect(customers.data.items.map(item=>item.customerId)).toEqual([customerId]);
      const profile=mcpToolOutputs.turas_profile_read_v1.parse((await client.callTool({name:'turas_profile_read_v1',arguments:{customerId,section:'facts'}})).structuredContent);
      expect(profile.status).toBe('available');if(profile.status==='available')expect(profile.data.items.some(item=>item.id===fact.revisionId)).toBe(true);
      const shared=mcpToolOutputs.turas_knowledge_list_v1.parse((await client.callTool({name:'turas_knowledge_list_v1',arguments:{limit:20}})).structuredContent);
      expect(shared.status).toBe('available');if(shared.status==='available')expect(shared.data.items.some(item=>item.publicationId===practice.publicationId)).toBe(true);
      const knowledge=mcpToolOutputs.turas_knowledge_read_v1.parse((await client.callTool({name:'turas_knowledge_read_v1',arguments:{publicationId:practice.publicationId}})).structuredContent);
      expect(knowledge.status).toBe('available');if(knowledge.status!=='available')throw Error('No synthetic knowledge');
      expect(knowledge.data.payload).toEqual(practice.payload);
      const sharedCitation=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:knowledge.data.citationHandle}})).structuredContent);
      expect(sharedCitation.status).toBe('available');if(sharedCitation.status==='available')expect(sharedCitation.data).toHaveProperty('publicationId',practice.publicationId);
      const listing=mcpToolOutputs.turas_evidence_list_v1.parse((await client.callTool({name:'turas_evidence_list_v1',arguments:{customerId,limit:20}})).structuredContent);
      expect(listing.status).toBe('available');if(listing.status!=='available')throw Error('No synthetic evidence');
      const researchItem=listing.data.items.find(item=>item.revisionId===research.sourceRevisionId);
      expect(researchItem).toBeDefined();if(!researchItem)throw Error('No synthetic research passage');
      const researchRead=mcpToolOutputs.turas_evidence_read_v1.parse((await client.callTool({name:'turas_evidence_read_v1',arguments:{customerId,revisionId:researchItem.revisionId,passageId:researchItem.passageId}})).structuredContent);
      expect(researchRead.status).toBe('available');if(researchRead.status!=='available')throw Error('Research unavailable');
      expect(researchRead.data.text).toBe('Synthetic independently checked research passage.');
      const researchCitation=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:researchRead.data.citationHandle}})).structuredContent);
      expect(researchCitation.status).toBe('available');
      await db.query(`UPDATE retrieval_passages SET locators=jsonb_set(locators,'{0,canonicalUrl}','"https://synthetic.invalid/changed"'::jsonb) WHERE id=$1`,[researchItem.passageId]);
      const changedResearch=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:researchRead.data.citationHandle}})).structuredContent);
      expect(changedResearch.status).toBe('unavailable');expect(changedResearch.data).toBeNull();
      const first=listing.data.items.find(item=>item.revisionId===fact.revisionId)!;
      const args={customerId,revisionId:first.revisionId,passageId:first.passageId};
      const passage=mcpToolOutputs.turas_evidence_read_v1.parse((await client.callTool({name:'turas_evidence_read_v1',arguments:args})).structuredContent);
      expect(passage.status).toBe('available');if(passage.status!=='available')throw Error('No synthetic passage');
      const citation=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:passage.data.citationHandle}})).structuredContent);
      expect(citation.status).toBe('available');if(citation.status==='available'&&'text'in citation.data)expect(citation.data.text).toBe(passage.data.text);
      await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[fact.recordId]);
      const withheld=mcpToolOutputs.turas_evidence_read_v1.parse((await client.callTool({name:'turas_evidence_read_v1',arguments:args})).structuredContent);
      expect(withheld.status).toBe('unavailable');expect(withheld.data).toBeNull();
    });
  }));
});
