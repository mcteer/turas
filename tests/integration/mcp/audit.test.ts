import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { recordMcpAccess } from '../../../lib/server/mcp/audit';
import { listMcpUsage } from '../../../lib/server/mcp/management';
describe('MCP minimized usage metadata',()=>{
 it('persists only fixed operation/result/timing metadata and serves safe owner usage',async()=>withMcpDatabase(async db=>{
  const {actor,browser}=await mcpFixture(db),requestId=randomUUID();
  await recordMcpAccess(actor,{requestId,operation:'profiles',result:'available',durationMs:42});
  const stored=(await db.query('SELECT * FROM mcp_access_receipts WHERE id=$1',[requestId])).rows[0];
  expect(Object.keys(stored).sort()).toEqual(['id','connection_id','environment_id','workspace_id','principal_id','membership_id','operation','result','duration_ms','created_at'].sort());
  const usage=await listMcpUsage(browser,actor.connectionId,{limit:20});expect(usage.items[0]).toMatchObject({requestId,operation:'profiles',result:'available',durationMs:42});
  expect(Object.keys(usage.items[0]).sort()).toEqual(['requestId','operation','result','durationMs','createdAt'].sort());
  expect((await db.query('SELECT last_used_at FROM mcp_connections WHERE id=$1',[actor.connectionId])).rows[0].last_used_at).not.toBeNull();
 }));
});
