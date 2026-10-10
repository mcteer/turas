import {randomUUID} from 'node:crypto';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withTransaction } from '../../../lib/server/db/client';
import { materializeCurrentProjection } from '../../../lib/server/retrieval/projections';
import { listMcpEvidence,readMcpEvidence,resolveMcpCitation } from '../../../lib/server/mcp/evidence';
describe('MCP original evidence fences',()=>{
  it('withholds stale accepted observations without relying on worker refresh',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const fact=await mcpAcceptedFact(db,browser,reviewer,customerId,{observedAt:'2010-01-01T00:00:00.000Z'});
    await materializeCurrentProjection(db,'accepted_profile',fact.revisionId,'internal');
    const result=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));expect(result.status).toBe('empty');
  }));
  it('denies cross-credential citations, confirmed conflicts and lost partner grants with workers stopped',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db,'partner'),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const fact=await mcpAcceptedFact(db,reviewer,reviewer,customerId);await materializeCurrentProjection(db,'accepted_profile',fact.revisionId,'delivery');
    const listing=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));const first=listing.data?.items[0];if(!first)throw Error('Missing synthetic delivery evidence');
    const read=await withTransaction(client=>readMcpEvidence(client,actor,{customerId,revisionId:first.revisionId,passageId:first.passageId}));if(!read.data)throw Error('Missing synthetic passage');
    const created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic separate evidence access',categories:['evidence'],customerIds:[customerId],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('No synthetic credential');const other=await authenticateMcpBearer('Bearer '+created.credential);
    await expect(withTransaction(client=>resolveMcpCitation(client,other,{citationHandle:read.data!.citationHandle}))).rejects.toMatchObject({status:422});
    await db.query(`INSERT INTO evidence_conflict_targets(id,environment_id,scope,workspace_id,customer_id,first_kind,first_revision_id,second_kind,second_revision_id,period_start,period_end,state,rationale)
      VALUES($1,$2,'customer',$3,$4,'accepted_profile',$5,'verified_research',$6,'2026-01-01','2026-12-31','confirmed','Synthetic conflict')`,
      [randomUUID(),actor.environmentId,actor.workspaceId,customerId,fact.revisionId,randomUUID()]);
    expect((await withTransaction(client=>resolveMcpCitation(client,actor,{citationHandle:read.data!.citationHandle}))).status).toBe('unavailable');
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1",[actor.membershipId]);
    await expect(withTransaction(client=>readMcpEvidence(client,actor,{customerId,revisionId:first.revisionId,passageId:first.passageId}))).rejects.toMatchObject({status:404});
  }));
  it('reads exact approved passages without embeddings, with credential-bound citations',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const fact=await mcpAcceptedFact(db,browser,reviewer,customerId);
    await materializeCurrentProjection(db,'accepted_profile',fact.revisionId,'internal');
    const listing=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));
    expect(listing.status).toBe('available');if(!listing.data)throw Error('Missing evidence');
    const first=listing.data.items[0];expect(first).not.toHaveProperty('text');
    const passage=await withTransaction(client=>readMcpEvidence(client,actor,{customerId,revisionId:first.revisionId,passageId:first.passageId}));
    expect(passage.status).toBe('available');if(!passage.data)throw Error('Missing passage');
    expect(passage.data.text.length).toBeGreaterThan(0);expect(passage.data.locators.length).toBeGreaterThan(0);expect(passage.data.quality).not.toHaveProperty('rationale');
    const citation=await withTransaction(client=>resolveMcpCitation(client,actor,{citationHandle:passage.data!.citationHandle}));
    expect(citation.data && 'text' in citation.data?citation.data.text:undefined).toEqual(passage.data.text);
    expect((await db.query('SELECT embedding_state FROM retrieval_passages')).rows.every(row=>row.embedding_state==='pending')).toBe(true);
    await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[fact.recordId]);
    const withdrawn=await withTransaction(client=>resolveMcpCitation(client,actor,{citationHandle:passage.data!.citationHandle}));
    expect(withdrawn.status).toBe('unavailable');expect(withdrawn.data).toBeNull();
  }));
  it('never releases pending or commercial originals even when projections exist',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const pending=await mcpAcceptedFact(db,browser,reviewer,customerId,{accepted:false});
    expect(await materializeCurrentProjection(db,'accepted_profile',pending.revisionId,'internal')).toBeNull();
    const commercial=await mcpAcceptedFact(db,browser,reviewer,customerId,{category:'commercial',audience:'internal'});
    await materializeCurrentProjection(db,'accepted_profile',commercial.revisionId,'internal');
    const listing=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));
    expect(listing.status).toBe('empty');expect(listing.data?.items).toEqual([]);
  }));
});
