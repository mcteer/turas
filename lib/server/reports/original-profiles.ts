import type {PoolClient} from 'pg';
import {unsupportedProfileRevisionIds} from '../profiles/eligibility';
import type {ReportSource,ReportSourceScope} from './sources';
import {nativeSourceKey} from './native-sources';
/** Batch original-head locks and eligibility before any complete profile payload is read. */
export async function eligibleOriginalReportProfiles(db:PoolClient,scope:ReportSourceScope,sources:readonly ReportSource[],lock:boolean){
 const refs=sources.filter(ref=>ref.kind==='accepted_profile'||ref.kind==='workload_identity'),eligible=new Set<string>();if(!refs.length)return eligible;
 const ids=[...new Set(refs.map(ref=>ref.revisionId))].sort();
 if(lock)await db.query('SELECT v.id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=ANY($1::uuid[]) ORDER BY r.id,v.id FOR SHARE OF r',[ids]);
 const unsupported=await unsupportedProfileRevisionIds(db,ids,true);
 const audience=scope.audience==='delivery'?'delivery':'internal';
 for(const kind of ['accepted_profile','workload_identity']){
  const group=refs.filter(ref=>ref.kind===kind);if(!group.length)continue;
  const input=JSON.stringify(group.map(ref=>({revision_id:ref.revisionId,generation:ref.generation,content_digest:ref.contentDigest,decision_id:ref.decisionId})));
  const recordset='jsonb_to_recordset($1::jsonb) AS x(revision_id uuid,generation bigint,content_digest text,decision_id uuid)';
  const match="v.id=x.revision_id AND v.workspace_id=$2 AND v.customer_id=$3 AND v.revision_number=x.generation AND v.content_digest=x.content_digest";
  const sql=kind==='workload_identity'?`SELECT x.* FROM ${recordset} JOIN profile_revisions v ON ${match} JOIN profile_records r ON r.current_accepted_revision_id=v.id AND r.kind='workload_details' JOIN customer_workloads w ON w.id=r.workload_id AND w.lifecycle='active' AND w.workspace_id=$2 AND w.customer_id=$3 JOIN profile_review_decisions d ON d.revision_id=v.id AND d.decision='accept' AND d.revision_id=x.decision_id WHERE $4::text IN ('internal','delivery') ORDER BY w.id FOR SHARE OF w`:
   `SELECT x.* FROM ${recordset} JOIN profile_revisions v ON ${match} JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id JOIN profile_review_decisions d ON d.revision_id=v.id AND d.decision='accept'
    WHERE v.data_category IN ('delivery_context','internal_operations') AND (v.audience='delivery' OR $4='internal') AND (x.decision_id IS NULL OR d.revision_id=x.decision_id)
    AND ($4='internal' OR (v.data_category='delivery_context' AND NOT(v.payload->>'kind'='stakeholder' AND v.payload->>'classification'='internal') AND NOT EXISTS(SELECT 1 FROM profile_evidence_links l
     LEFT JOIN evidence_source_revisions source ON source.id=l.source_revision_id LEFT JOIN profile_revisions support ON support.id=l.supporting_profile_revision_id LEFT JOIN artifact_evidence_selections selection ON selection.id=l.artifact_selection_id
     WHERE l.profile_revision_id=v.id AND d.partner_safe_attestation IS NULL AND ((source.id IS NOT NULL AND source.audience<>'delivery') OR (support.id IS NOT NULL AND (support.audience<>'delivery' OR support.data_category<>'delivery_context')) OR (selection.id IS NOT NULL AND (selection.audience<>'delivery' OR selection.data_category<>'delivery_context'))))))`;
  const rows=(await db.query(sql,[input,scope.workspaceId,scope.customerId,audience])).rows;
  for(const row of rows)if(!unsupported.has(row.revision_id))for(const ref of group.filter(ref=>ref.revisionId===row.revision_id && ref.generation===Number(row.generation) && ref.contentDigest===row.content_digest && ref.decisionId===row.decision_id))eligible.add(nativeSourceKey(ref));
 }
 return eligible;
}
