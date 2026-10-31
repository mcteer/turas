import {randomUUID} from 'node:crypto';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withTransaction } from '../../../lib/server/db/client';
import { materializeCurrentProjection } from '../../../lib/server/retrieval/projections';
import { listMcpEvidence,readMcpEvidence,resolveMcpCitation } from '../../../lib/server/mcp/evidence';
describe('MCP original evidence fences',()=>{
  it('continues a bounded withheld page without skipping later eligible evidence or claiming exhaustion',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const stale=await mcpAcceptedFact(db,browser,reviewer,customerId,{observedAt:'2010-01-01T00:00:00.000Z'});
    const current=await mcpAcceptedFact(db,browser,reviewer,customerId);
    await materializeCurrentProjection(db,'accepted_profile',stale.revisionId,'internal');
    await materializeCurrentProjection(db,'accepted_profile',current.revisionId,'internal');
    // Owned cache metadata deliberately precedes the real eligible passage.
    // Every withheld candidate must still pass the ordinary original checks.
    const template=(await db.query(`SELECT p.source_id,p.locators FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1 AND s.audience='internal' AND s.lifecycle_state='current' LIMIT 1`,[stale.revisionId])).rows[0];
    await db.query('DELETE FROM retrieval_passages WHERE source_id=$1',[template.source_id]);
    await db.query(`INSERT INTO retrieval_passages(id,source_id,ordinal,passage_digest,passage_text,locators)
      SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,i,
        encode(sha256(convert_to('Withheld synthetic passage '||i,'UTF8')),'hex'),
        'Withheld synthetic passage '||i,$2::jsonb FROM generate_series(1,100) i`,[template.source_id,JSON.stringify(template.locators)]);
    expect((await db.query("SELECT count(*)::int AS n FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.id=$1 AND s.lifecycle_state='current'",[template.source_id])).rows[0].n).toBe(100);
    const first=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));
    expect(first.status).toBe('available');expect(first.data?.items).toEqual([]);expect(first.nextCursor).toEqual(expect.any(String));
    const next=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20,cursor:first.nextCursor!}));
    expect(next.status).toBe('available');expect(next.nextCursor).toBeNull();
    expect(next.data?.items.length).toBeGreaterThan(0);
    expect([...new Set(next.data?.items.map(item=>item.revisionId))]).toEqual([current.revisionId]);
    await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[current.recordId]);
    const withheld=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20}));
    expect(withheld.status).toBe('available');expect(withheld.data?.items).toEqual([]);expect(withheld.nextCursor).toEqual(expect.any(String));
    const exhausted=await withTransaction(client=>listMcpEvidence(client,actor,{customerId,limit:20,cursor:withheld.nextCursor!}));
    expect(exhausted.status).toBe('empty');expect(exhausted.data?.items).toEqual([]);expect(exhausted.nextCursor).toBeNull();
  }));
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
