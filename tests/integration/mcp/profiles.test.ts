import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../../fixtures/mcp/setup';
import { readMcpProfile } from '../../../lib/server/mcp/profiles';
import { withTransaction } from '../../../lib/server/db/client';
describe('MCP accepted profile sections',()=>{
  it('restricts partners to delivery fields and withholds confirmed conflicting originals',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db,'partner'),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const a=await mcpAcceptedFact(db,reviewer,reviewer,customerId),b=await mcpAcceptedFact(db,reviewer,reviewer,customerId);
    await mcpAcceptedFact(db,reviewer,reviewer,customerId,{audience:'internal'});
    await mcpAcceptedFact(db,reviewer,reviewer,customerId,{audience:'internal',category:'personnel'});
    const before=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));expect(before.data?.items).toHaveLength(2);
    await db.query(`INSERT INTO evidence_conflicts(id,workspace_id,customer_id,first_revision_id,second_revision_id,state,rationale)
      VALUES($1,$2,$3,$4,$5,'confirmed','Synthetic conflicting observations')`,[randomUUID(),actor.workspaceId,customerId,a.revisionId,b.revisionId]);
    const after=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));expect(after.status).toBe('empty');
  }));
  it('covers more than one full page without totals, duplicate records or private quality rationale',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    for(let i=0;i<22;i++)await mcpAcceptedFact(db,browser,reviewer,customerId);
    const first=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));
    if(!first.data)throw Error('No first page');expect(first.data.items).toHaveLength(20);expect(first.data).not.toHaveProperty('total');
    const second=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20,cursor:first.nextCursor}));
    if(!second.data)throw Error('No next page');expect(second.data.items).toHaveLength(2);expect(second.nextCursor).toBeNull();
    expect(new Set([...first.data.items,...second.data.items].map(item=>item.recordId)).size).toBe(22);
    expect(first.data.items.every(item=>!('rationale'in item.quality))).toBe(true);
  }));
  it('excludes pending and commercial/personnel records, private review fields and UI actions',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const accepted=await mcpAcceptedFact(db,browser,reviewer,customerId);await mcpAcceptedFact(db,browser,reviewer,customerId,{accepted:false});
    await mcpAcceptedFact(db,browser,reviewer,customerId,{audience:'internal',category:'commercial'});
    const result=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));
    expect(result.status).toBe('available');if(!result.data)throw Error('No accepted profile data');expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]).toMatchObject({id:accepted.revisionId,reviewState:'accepted'});
    for(const key of ['authorMembershipId','decisionRationale','candidateSequence','canReview','sourceReferences'])expect(result.data.items[0]).not.toHaveProperty(key);
  }));
  it('pages immutable IDs and refuses a changed generation rather than mixing pages',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    await mcpAcceptedFact(db,browser,reviewer,customerId);await mcpAcceptedFact(db,browser,reviewer,customerId);
    const first=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:1}));
    if(!first.data)throw Error('No first page');expect(first.data.items).toHaveLength(1);expect(first.nextCursor).not.toBeNull();
    const second=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:1,cursor:first.nextCursor}));
    if(!second.data)throw Error('No second page');expect(second.data.items).toHaveLength(1);expect(second.data.items[0]).not.toEqual(first.data.items[0]);
    await mcpAcceptedFact(db,browser,reviewer,customerId);
    const changed=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:1,cursor:first.nextCursor}));
    expect(changed.status).toBe('unavailable');
  }));
});
