import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {getServerConfig} from '../config';
import type {ExpansionActor} from './policy';
import type {ExpansionSource} from './schema';
import {expansionEvidenceMetadata,expansionEvidenceTitle} from './sources';
/** Call only after the complete original and delivery head fence. No lineage is serialized. */
export async function captureExpansionEvidence(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,refs:readonly ExpansionSource[]){
 const evidence=[];
 for(const source of refs){
  const {citationId:_permission,...reference}='citationId' in source?source:{...source,citationId:undefined};
  if('locator' in source){
   const row=(await db.query(`SELECT p.passage_text FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
    WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3 AND s.source_generation=$4
     AND s.content_digest=$5 AND s.lifecycle_state='current' AND p.locators @> $6::jsonb
     AND ((s.scope='shared' AND $2='published_shared') OR (s.scope='customer' AND s.workspace_id=$7 AND s.customer_id=$8
      AND ($9::uuid IS NULL OR s.workload_id IS NULL OR s.workload_id=$9))) ORDER BY p.ordinal LIMIT 1`,
   [getServerConfig().TURAS_ENVIRONMENT_ID,source.kind==='shared_knowledge'?'published_shared':source.kind,source.sourceRevisionId,source.generation,source.contentDigest,JSON.stringify([source.locator]),actor.workspaceId,customerId,workloadId])).rows[0];
   if(!row)throw new HttpFailure(409,'expansion_context_changed','Selected evidence unavailable');
   evidence.push({citationKey:source.id,reference,text:String(row.passage_text),title:await expansionEvidenceTitle(db,source),...await expansionEvidenceMetadata(db,source)});
  }else{
   const row=source.kind==='execution_record'?(await db.query(`SELECT p.content,v.event_date::text AS event_date FROM execution_record_revisions v
    JOIN execution_records r ON r.accepted_revision_id=v.id JOIN execution_record_payloads p ON p.revision_id=v.id
    WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5`,
   [source.sourceRevisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,source.engagementId])).rows[0]
    :(await db.query(`SELECT p.content,b.accepted_at FROM milestone_baselines b JOIN milestone_baseline_payloads p ON p.baseline_id=b.id
     JOIN engagements e ON e.active_baseline_id=b.id WHERE b.id=$1 AND b.environment_id=$2 AND b.workspace_id=$3 AND b.customer_id=$4 AND b.engagement_id=$5`,
    [source.sourceRevisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,source.engagementId])).rows[0];
   if(!row)throw new HttpFailure(409,'expansion_context_changed','Selected delivery evidence unavailable');
   evidence.push({citationKey:source.id,reference,text:JSON.stringify(row.content),title:source.kind.replaceAll('_',' '),
    publicationAt:null,observationAt:null,eventAt:row.event_date??null,retrievalAt:null,reviewAt:null,quality:null,
    ...(source.kind==='milestone_baseline'?{planningReviewedAt:new Date(row.accepted_at).toISOString(),classification:'planning_proposal'}:{classification:'accepted_execution_record'})});
  }
 }
 return evidence;
}
