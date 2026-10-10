import { describe,expect,it } from 'vitest';
import { randomUUID,createHash } from 'node:crypto';
import { mcpFixture,withMcpDatabase,mcpInternalPeer } from '../../fixtures/mcp/setup';
import { createMcpConnection,revokeMcpConnection,listMcpConnections,reconcileMcpRequest } from '../../../lib/server/mcp/management';
import { authenticateMcpBearer,newMcpCredential } from '../../../lib/server/mcp/credentials';
describe('MCP credentials and one-time delivery',()=>{
  it('denies expired credentials and inactive current membership without widening lifetime',async()=>withMcpDatabase(async db=>{
    const {actor,browser}=await mcpFixture(db),expired=newMcpCredential();
    await db.query(`INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,'Synthetic expired',ARRAY['knowledge'],$6,$7,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day')`,
      [expired.id,actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,actor.scopeDigest,expired.hash]);
    await expect(authenticateMcpBearer('Bearer '+expired.credential)).rejects.toMatchObject({status:401});
    const created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic inactive',categories:['knowledge'],customerIds:[],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('No synthetic credential');
    await db.query('UPDATE memberships SET active=false WHERE id=$1',[actor.membershipId]);
    await expect(authenticateMcpBearer('Bearer '+created.credential)).rejects.toMatchObject({status:401});
  }));
  it('serializes concurrent creation at the active cap independently of management rate limits',async()=>withMcpDatabase(async db=>{
    const {actor,browser}=await mcpFixture(db);
    for(let i=0;i<8;i++)await db.query(`INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,'Synthetic cap fixture',ARRAY['knowledge'],$6,$6,clock_timestamp()+interval '1 day')`,
      [randomUUID(),actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,createHash('sha256').update(randomUUID()).digest('hex')]);
    const results=await Promise.allSettled([0,1].map(i=>createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic race '+i,categories:['knowledge'],customerIds:[],lifetimeDays:7})));
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await db.query('SELECT count(*)::integer AS n FROM mcp_connections WHERE membership_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[actor.membershipId])).rows[0].n).toBe(10);
  }));
  it('stores only a hash, reconciles exact replay and rejects altered replay',async()=>withMcpDatabase(async db=>{
    const {browser,customerId}=await mcpFixture(db),requestKey=randomUUID();
    const input={requestKey,name:'Synthetic client',categories:['profiles' as const],customerIds:[customerId],lifetimeDays:7};
    const created=await createMcpConnection(browser,input);
    expect(created.secretAvailable).toBe(true);
    if(!created.secretAvailable)throw Error('Synthetic creation did not deliver secret');
    const stored=(await db.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[created.connection.id])).rows[0];
    expect(stored.credential_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(created.credential);
    const replay=await createMcpConnection(browser,input);
    expect(replay.secretAvailable).toBe(false);expect(replay).not.toHaveProperty('credential');
    await expect(createMcpConnection(browser,{...input,name:'Altered'})).rejects.toMatchObject({status:409});
    const actor=await authenticateMcpBearer('Bearer '+created.credential);
    expect(actor.membershipId).toBe(browser.membershipId);expect(actor).not.toHaveProperty('sessionId');expect(actor).not.toHaveProperty('token');
    await revokeMcpConnection(browser,created.connection.id,{requestKey:randomUUID(),expectedConnectionId:created.connection.id});
    await expect(authenticateMcpBearer('Bearer '+created.credential)).rejects.toMatchObject({status:401});
  }));
  it('does not create customer grants and refuses customer scope outside authority',async()=>withMcpDatabase(async db=>{
    const {browser}=await mcpFixture(db,'partner');
    await expect(createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic client',categories:['profiles'],customerIds:[randomUUID()],lifetimeDays:7})).rejects.toMatchObject({status:404});
    const knowledge=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic knowledge',categories:['knowledge'],customerIds:[],lifetimeDays:7});
    expect(knowledge.secretAvailable).toBe(true);
  }));
  it('denies peers and noncanonical admins while permitting canonical workspace revocation',async()=>withMcpDatabase(async db=>{
    const {actor,browser}=await mcpFixture(db),peer=await mcpInternalPeer(db,browser.workspaceId),otherAdmin=await mcpInternalPeer(db,browser.workspaceId,false,'admin'),admin=await mcpInternalPeer(db,browser.workspaceId,true);
    expect((await listMcpConnections(peer,{limit:20})).connections).toHaveLength(0);
    await expect(listMcpConnections(otherAdmin,{limit:20},true)).rejects.toMatchObject({status:403});
    await expect(revokeMcpConnection(peer,actor.connectionId,{requestKey:randomUUID(),expectedConnectionId:actor.connectionId})).rejects.toMatchObject({status:404});
    expect((await listMcpConnections(admin,{limit:20},true)).connections).toHaveLength(1);
    await revokeMcpConnection(admin,actor.connectionId,{requestKey:randomUUID(),expectedConnectionId:actor.connectionId});
    expect((await db.query('SELECT revoked_at FROM mcp_connections WHERE id=$1',[actor.connectionId])).rows[0].revoked_at).not.toBeNull();
  }));
  it('reconciles while exposure is disabled and keeps unknown requests unconfirmed',async()=>withMcpDatabase(async db=>{
    const {browser}=await mcpFixture(db),requestKey=randomUUID();
    const created=await createMcpConnection(browser,{requestKey,name:'Synthetic reconciliation',categories:['knowledge'],customerIds:[],lifetimeDays:30});
    const previous=process.env.TURAS_015_DISABLED;process.env.TURAS_015_DISABLED='1';
    try{
      const receipt=await reconcileMcpRequest(browser,requestKey);expect(receipt.confirmed).toBe(true);expect(receipt).not.toHaveProperty('credential');
      expect((await reconcileMcpRequest(browser,randomUUID())).confirmed).toBe(false);
      await revokeMcpConnection(browser,created.connection.id,{requestKey:randomUUID(),expectedConnectionId:created.connection.id});
      expect((await listMcpConnections(browser,{limit:20})).serviceState).toBe('disabled');
    }finally{process.env.TURAS_015_DISABLED=previous;}
  }));
});
