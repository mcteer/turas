import type { PoolClient } from 'pg';
import type { GapSource } from '../../contracts/product-gaps';
import type { GapActor } from './policy';
import { dependencyUnion as executionUnion,type ExpansionDependency } from '../expansion/dependencies';
import { HttpFailure } from '../../contracts/http';
export type GapDependency=ExpansionDependency & {customerId?:string};
const originalSql={
 accepted_profile:'SELECT revision_number AS generation,content_digest AS digest,workspace_id,customer_id FROM profile_revisions WHERE id=$1',
 approved_excerpt:'SELECT lifecycle_generation AS generation,excerpt_digest AS digest,workspace_id,customer_id FROM artifact_evidence_selections WHERE id=$1',
 verified_research:'SELECT version AS generation,passage_digest AS digest,workspace_id,customer_id FROM evidence_source_revisions WHERE id=$1',
 shared_knowledge:'SELECT p.head_generation AS generation,r.content_digest AS digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.revision_id=$1',
};
/** Direct references retain projection digests; dependencies bind immutable
 * original bytes. These are different identities and must never be conflated. */
export async function gapDependencyUnion(db:PoolClient,actor:GapActor,refs:readonly GapSource[],max=200){
 const pending:Array<{dependency:ExpansionDependency;direct:boolean;customerId?:string}>=[];
 for(const ref of refs){const closure=await executionUnion(db,actor,ref.customerId??actor.workspaceId,[ref]);pending.push(...closure.map(dependency=>({dependency,direct:dependency.kind===ref.kind&&dependency.revisionId===ref.sourceRevisionId&&Boolean(ref.locator),customerId:ref.customerId??undefined})));}
 const seen=new Map<string,GapDependency>();
 while(pending.length){const {dependency:d,direct,customerId}=pending.pop()!,sql=originalSql[d.kind as keyof typeof originalSql];let current:GapDependency={...d,...(customerId?{customerId}:{})};
  if(sql){const row=(await db.query(sql,[d.revisionId])).rows[0];if(!row||row.workspace_id&&row.workspace_id!==actor.workspaceId)throw new HttpFailure(409,'source_unavailable','Original evidence unavailable');if(Number(row.generation)!==d.generation||!direct&&row.digest!==d.contentDigest)throw new HttpFailure(409,'source_unavailable','Original identity changed');current={...current,contentDigest:row.digest,...(row.customer_id?{customerId:row.customer_id}:{})};}
  const key=`${d.kind}:${d.revisionId}`,prior=seen.get(key);
  if(prior){if(prior.generation!==current.generation||prior.contentDigest!==current.contentDigest||prior.engagementId!==current.engagementId)throw new HttpFailure(409,'source_unavailable','Conflicting original evidence');continue;}
  seen.set(key,current);if(seen.size>max)throw new HttpFailure(413,'scope_too_large','Original evidence closure exceeds limit');
  const linked:Array<{kind:keyof typeof originalSql;id:string}>=[];
  if(d.kind==='accepted_profile'){const rows=(await db.query('SELECT source_revision_id,supporting_profile_revision_id,artifact_selection_id FROM profile_evidence_links WHERE profile_revision_id=$1',[d.revisionId])).rows;for(const r of rows){if(r.source_revision_id)linked.push({kind:'verified_research',id:r.source_revision_id});if(r.supporting_profile_revision_id)linked.push({kind:'accepted_profile',id:r.supporting_profile_revision_id});if(r.artifact_selection_id)linked.push({kind:'approved_excerpt',id:r.artifact_selection_id});}}
  if(d.kind==='approved_excerpt'){const r=(await db.query('SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[d.revisionId])).rows[0];if(r?.profile_revision_id)linked.push({kind:'accepted_profile',id:r.profile_revision_id});}
  for(const link of linked){const row=(await db.query(originalSql[link.kind],[link.id])).rows[0];if(!row)throw new HttpFailure(409,'source_unavailable','Supporting original unavailable');pending.push({dependency:{kind:link.kind,revisionId:link.id,generation:Number(row.generation),contentDigest:row.digest},direct:false});}
 }
 return [...seen.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
}
