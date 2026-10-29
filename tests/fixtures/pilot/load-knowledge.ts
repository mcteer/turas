import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate} from '../../../lib/server/knowledge/service';
import type {pilotLoadEvidenceFixture} from './load';
/** Reviewed generic practice, published through ordinary rights/sanitization
 * review. Its customer-specific lineage remains governed and separately scoped. */
export async function pilotLoadKnowledgeFixture(db:PoolClient,evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>){
 requireOwnedPilotDatabase(process.env,true);const author=evidence.actors[1],reviewer=evidence.actors[0],revisionId=evidence.customers[0].revisionIds[0];
 const source=(await db.query('SELECT revision_number,content_digest FROM profile_revisions WHERE id=$1',[revisionId])).rows[0];
 await db.query('BEGIN');try{
  const draft=await createKnowledgeCandidate(db,author,{idempotencyKey:randomUUID(),customerId:evidence.customers[0].id,payload:{title:'Synthetic generic build-stage practice',productVersion:'Unknown',problem:'An unmeasured build stage',prerequisites:'A supported build pipeline',solution:'Measure stages individually',reasoning:'Timing identifies bottlenecks',applicability:'Build pipelines with stage timing',limitations:'Validate current workload applicability',validation:'Compare independently observed stage timings'},lineage:[{sourceKind:'accepted_profile',sourceRevisionId:revisionId,sourceGeneration:Number(source.revision_number),sourceDigest:source.content_digest,rightsBasis:'Explicit controlled synthetic reuse permission'}]});
  await submitKnowledgeCandidate(db,author,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest});
  const decision=await decideKnowledgeCandidate(db,reviewer,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Only generic synthetic process guidance; source identifiers and account details removed',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
  const publication=(await db.query('SELECT id,revision_id FROM knowledge_publications WHERE contribution_id=$1 AND state=\'published\'',[draft.id])).rows[0];if(!publication)throw Error('Normally reviewed load publication unavailable');await db.query('COMMIT');return {publicationId:String(publication.id),revisionId:String(publication.revision_id),decision};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
