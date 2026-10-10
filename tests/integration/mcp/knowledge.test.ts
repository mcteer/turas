import {createMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withTransaction } from '../../../lib/server/db/client';
import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from '../../../lib/server/knowledge/service';
import { listMcpKnowledge,readMcpKnowledge } from '../../../lib/server/mcp/knowledge';
const payload={title:'Synthetic build timing',productVersion:'2026.10',problem:'Slow build stages',prerequisites:'A supported pipeline',
  solution:'Measure stages individually',reasoning:'Timings identify bottlenecks',applicability:'Build pipelines',limitations:'Validate each workload',validation:'Compare before and after'};
describe('MCP sanitized shared publications',()=>{
  it('returns explicit incomplete when the bounded eligibility scan cannot reach a full page',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db);
    // Deliberately incomplete synthetic metadata, never accepted source content.
    const contributions:string[]=[];try{
    for(let i=0;i<101;i++){
      const contribution=randomUUID(),revision=randomUUID();contributions.push(contribution);
      await db.query(`INSERT INTO knowledge_contributions(id,environment_id,workspace_id,customer_id,author_membership_id,idempotency_key,request_digest)
        VALUES($1,$2,$3,$4,$5,$1::uuid::text,$6)`,[contribution,actor.environmentId,actor.workspaceId,customerId,browser.membershipId,'a'.repeat(64)]);
      await db.query(`INSERT INTO knowledge_revisions(id,contribution_id,revision_number,content_digest,author_membership_id,idempotency_key,request_digest)
        VALUES($1,$2,1,$3,$4,$1::uuid::text,$3)`,[revision,contribution,'a'.repeat(64),browser.membershipId]);
      await db.query('INSERT INTO knowledge_revision_payloads(revision_id,payload) VALUES($1,$2)',[revision,JSON.stringify(payload)]);
      await db.query(`INSERT INTO knowledge_lineage(id,contribution_id,revision_id,ordinal,source_kind,source_revision_id,source_generation,source_digest,rights_basis)
        VALUES($1,$2,$3,1,'accepted_profile',$4,1,$5,'Synthetic missing original')`,[randomUUID(),contribution,revision,randomUUID(),'a'.repeat(64)]);
      await db.query(`INSERT INTO knowledge_publications(id,environment_id,contribution_id,revision_id,head_generation,state,public_quality,published_at)
        VALUES($1,$2,$3,$4,1,'published','{}',clock_timestamp())`,[randomUUID(),actor.environmentId,contribution,revision]);
    }
    const result=await withTransaction(client=>listMcpKnowledge(client,actor,{limit:20}));
    expect(result.status).toBe('unavailable');expect(result).toHaveProperty('reason','incomplete');expect(result.data).toBeNull();
    }finally{await db.query("UPDATE knowledge_publications SET state='withdrawn',head_generation=head_generation+1 WHERE contribution_id=ANY($1::uuid[])",[contributions]);}
  }));
  it('reuses reviewed publications across workspaces without original customer coordinates and stops on withdrawal',async()=>withMcpDatabase(async db=>{
    const original=await mcpFixture(db),reviewer=await mcpInternalPeer(db,original.actor.workspaceId,false,'admin');
    const fact=await mcpAcceptedFact(db,original.browser,reviewer,original.customerId);
    const candidate=await createKnowledgeCandidate(db,original.browser,{idempotencyKey:'mcp-create-'+randomUUID(),customerId:original.customerId,payload,
      lineage:[{sourceKind:'accepted_profile',sourceRevisionId:fact.revisionId,sourceGeneration:fact.generation,sourceDigest:fact.digest,rightsBasis:'Synthetic reusable observation'}]});
    await submitKnowledgeCandidate(db,original.browser,candidate.id,{idempotencyKey:'mcp-submit-'+randomUUID(),expectedRevision:1,expectedDigest:candidate.digest});
    await decideKnowledgeCandidate(db,reviewer,candidate.id,{idempotencyKey:'mcp-publish-'+randomUUID(),expectedRevision:1,expectedDigest:candidate.digest,
      action:'publish',rightsAttested:true,sanitizationRationale:'Only generic process guidance',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,
        peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
    const recipient=await mcpFixture(db,'partner');
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1",[recipient.browser.membershipId]);
    const created=await createMcpConnection(recipient.browser,{requestKey:randomUUID(),name:'Synthetic shared only',categories:['knowledge'],customerIds:[],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('Missing synthetic credential');const actor=await authenticateMcpBearer('Bearer '+created.credential);
    const listing=await withTransaction(client=>listMcpKnowledge(client,actor,{limit:20}));
    expect(listing.status).toBe('available');if(!listing.data)throw Error('Missing publication');
    const publicationId=(await db.query('SELECT id FROM knowledge_publications WHERE contribution_id=$1',[candidate.id])).rows[0].id;
    const entry=listing.data.items.find(item=>item.publicationId===publicationId);if(!entry)throw Error('Missing expected publication');
    expect(JSON.stringify(entry)).not.toContain(original.customerId);expect(JSON.stringify(entry)).not.toContain(original.actor.membershipId);
    expect(JSON.stringify(entry)).not.toContain(fact.revisionId);expect(entry).not.toHaveProperty('payload');
    const read=await withTransaction(client=>readMcpKnowledge(client,actor,{publicationId:entry.publicationId,expectedRevisionId:entry.revisionId}));
    expect(read.status).toBe('available');expect(read.data?.payload).toEqual(payload);
    await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[fact.recordId]);
    const withdrawn=await withTransaction(client=>readMcpKnowledge(client,actor,{publicationId:entry.publicationId}));
    expect(withdrawn.status).toBe('unavailable');expect(withdrawn.data).toBeNull();
  }));
});
