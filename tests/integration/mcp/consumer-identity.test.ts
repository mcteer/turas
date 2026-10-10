import { describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withMcpConsumer } from '../../fixtures/mcp/consumer';
import { createMcpConnection,revokeMcpConnection } from '../../../lib/server/mcp/management';
import { mcpToolNames,mcpToolOutputs } from '../../../lib/contracts/mcp';
describe('MCP actual modern SDK consumer',()=>{
  it('discovers scoped tools and reads independently authenticated identity',async()=>withMcpDatabase(async db=>{
    const {browser}=await mcpFixture(db),created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic SDK',categories:['knowledge'],customerIds:[],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('Synthetic credential not delivered');
    await withMcpConsumer(process.env.TURAS_APP_ORIGIN!,created.credential,async client=>{
      const discovery=await client.listTools();
      expect(discovery.tools.map(tool=>tool.name).sort()).toEqual(['turas_identity_v1','turas_knowledge_list_v1','turas_knowledge_read_v1','turas_citation_resolve_v1'].sort());
      expect(discovery.tools.every(tool=>mcpToolNames.includes(tool.name as typeof mcpToolNames[number]))).toBe(true);
      const result=await client.callTool({name:'turas_identity_v1',arguments:{}});
      const envelope=mcpToolOutputs.turas_identity_v1.parse(result.structuredContent);
      expect(envelope.status).toBe('available');
      if(envelope.status==='available')expect(envelope.data.workspaceId).toBe(browser.workspaceId);
      await revokeMcpConnection(browser,created.connection.id,{requestKey:randomUUID(),expectedConnectionId:created.connection.id});
      await expect(client.callTool({name:'turas_identity_v1',arguments:{}})).rejects.toBeDefined();
    });
  }));
});
