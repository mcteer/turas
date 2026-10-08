import {retireExpansionAdviceDependency} from './advice-invalidation';
import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
/** Metadata fanout shares the original mutation transaction. Read fences remain
 * authoritative if a source is changed while the worker is paused. */
export async function invalidateExpansionSource(db:PoolClient,sourceKind:string,sourceRevisionId:string){
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 const version=Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[env])).rows[0]?.schema_version??0);if(version<46)return 0;
 const kind=sourceKind==='published_shared'?'shared_knowledge':sourceKind;
 const revisions=(await db.query(`SELECT DISTINCT r.id FROM expansion_revisions r JOIN expansion_hypotheses h ON h.id=r.record_id
  LEFT JOIN expansion_payloads p ON p.revision_id=r.id WHERE h.environment_id=$1 AND (
   EXISTS(SELECT 1 FROM expansion_dependencies d WHERE d.revision_id=r.id AND d.source_kind=$2 AND d.source_revision_id=$3)
   OR $2='milestone_baseline' AND EXISTS(SELECT 1 FROM milestone_baselines b WHERE b.id=$3 AND b.environment_id=$1 AND (
    (p.content->'deliveryLinks') @> jsonb_build_array(jsonb_build_object('kind','plan_revision','revisionId',b.revision_id)) OR
    (p.content->'selectedEngagementIds') @> jsonb_build_array(b.engagement_id)))
   OR $2='execution_record' AND EXISTS(SELECT 1 FROM execution_record_revisions v WHERE v.id=$3 AND v.environment_id=$1
    AND (p.content->'selectedEngagementIds') @> jsonb_build_array(v.engagement_id))) ORDER BY r.id`,[env,kind,sourceRevisionId])).rows;
 await retireExpansionAdviceDependency(db,kind,sourceRevisionId);
 if(['execution_record','milestone_baseline'].includes(kind)){const table=kind==='execution_record'?'execution_record_revisions':'milestone_baselines';const engagement=(await db.query(`SELECT engagement_id FROM ${table} WHERE id=$1 AND environment_id=$2`,[sourceRevisionId,env])).rows[0]?.engagement_id;if(engagement)await retireExpansionAdviceDependency(db,'execution_collection',engagement);}
 for(const revision of revisions)await db.query('SELECT turas_expansion_invalidate_revision($1,$2)',[env,revision.id]);
 return revisions.length;
}
