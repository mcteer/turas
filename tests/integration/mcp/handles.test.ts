import { describe,expect,it } from 'vitest';
import { createHash,randomUUID } from 'node:crypto';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { createMcpHandle,resolveMcpHandle } from '../../../lib/server/mcp/handles';
import { createMcpConnection } from '../../../lib/server/mcp/management';
import { authenticateMcpBearer } from '../../../lib/server/mcp/credentials';
import { withTransaction } from '../../../lib/server/db/client';
describe('MCP metadata-only connection-bound handles',()=>{
  it('does not permit same-member cross-credential swapping',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db);
    const binding={kind:'cursor' as const,category:'profiles' as const,customerId,section:'facts',filterDigest:'a'.repeat(64),positionId:randomUUID(),generation:1};
    const handle=await withTransaction(client=>createMcpHandle(client,actor,binding));
    expect(handle).toHaveLength(43);
    expect(await withTransaction(client=>resolveMcpHandle(client,actor,handle,binding))).toMatchObject(binding);
    const other=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic second',categories:['profiles'],customerIds:[customerId],lifetimeDays:7});
    if(!other.secretAvailable)throw Error('No synthetic credential');
    const peer=await authenticateMcpBearer('Bearer '+other.credential);
    await expect(withTransaction(client=>resolveMcpHandle(client,peer,handle,binding))).rejects.toMatchObject({status:422});
    await expect(withTransaction(client=>resolveMcpHandle(client,actor,handle,{...binding,filterDigest:'b'.repeat(64)}))).rejects.toMatchObject({status:422});
    const stored=(await db.query('SELECT * FROM mcp_handles WHERE connection_id=$1',[actor.connectionId])).rows[0];
    expect(JSON.stringify(stored)).not.toContain(handle);
    const expired='x'.repeat(43),expiredHash=createHash('sha256').update(expired).digest('hex');
    await db.query(`INSERT INTO mcp_handles(handle_hash,kind,environment_id,workspace_id,principal_id,membership_id,connection_id,category,customer_id,section,scope_digest,filter_digest,position_id,revision_id,generation,passage_id,content_digest,created_at,expires_at)
      SELECT $1,kind,environment_id,workspace_id,principal_id,membership_id,connection_id,category,customer_id,section,scope_digest,filter_digest,position_id,revision_id,generation,passage_id,content_digest,
        clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '2 minutes' FROM mcp_handles WHERE handle_hash=$2`,[expiredHash,stored.handle_hash]);
    await expect(withTransaction(client=>resolveMcpHandle(client,actor,expired,binding))).rejects.toMatchObject({status:422});
    expect(stored).not.toHaveProperty('text');expect(stored).not.toHaveProperty('payload');
  }));
});
