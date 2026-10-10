import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../../../lib/server/auth/sessions';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { mcpAcceptedFact } from './setup';
import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from '../../../lib/server/knowledge/service';
export async function mcpPublishedKnowledge(db:PoolClient,author:CurrentSession,reviewer:CurrentSession,customerId:string){
 requireOwnedMcpDatabase(process.env,true);const fact=await mcpAcceptedFact(db,author,reviewer,customerId);
 const payload={title:'Synthetic shared engineering practice',productVersion:'2026.10',problem:'Unknown build bottleneck',prerequisites:'A supported build pipeline',
   solution:'Measure stages individually',reasoning:'Timing identifies bottlenecks',applicability:'Build pipelines',limitations:'Validate for each workload',validation:'Compare before and after'};
 const draft=await createKnowledgeCandidate(db,author,{idempotencyKey:'mcp-draft-'+randomUUID(),customerId,payload,lineage:[{
   sourceKind:'accepted_profile',sourceRevisionId:fact.revisionId,sourceGeneration:fact.generation,sourceDigest:fact.digest,rightsBasis:'Synthetic reusable observation'}]});
 await submitKnowledgeCandidate(db,author,draft.id,{idempotencyKey:'mcp-submit-'+randomUUID(),expectedRevision:1,expectedDigest:draft.digest});
 await decideKnowledgeCandidate(db,reviewer,draft.id,{idempotencyKey:'mcp-publish-'+randomUUID(),expectedRevision:1,expectedDigest:draft.digest,action:'publish',rightsAttested:true,
   sanitizationRationale:'Only generic process guidance',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,
     identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
 const publication=(await db.query('SELECT id,revision_id FROM knowledge_publications WHERE contribution_id=$1',[draft.id])).rows[0];
 return {publicationId:publication.id as string,revisionId:publication.revision_id as string,fact,payload};
}
