import {getServerConfig} from '../config';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {sharedOriginSql} from '../access/policy';
export type HistoricalSource={kind:string;id:string;workspaceId:string;customerId?:string|null;generation?:string};
/** One bounded metadata query for the full original dependency union. Source
 * supersession, receipt age and inventory generation are not revocation. */
export async function historicalContentWithdrawn(db:PoolClient,roots:readonly HistoricalSource[]):Promise<boolean>{
 if(!roots.length)return false;
 if(roots.length>1000)throw new HttpFailure(422,'scope_too_large','Start a new conversation for current evidence');
 const rows=(await db.query<{retained:boolean}>(`WITH RECURSIVE original(kind,id,workspace_id,customer_id,generation) AS(
  (SELECT kind,id,workspace_id,customer_id,generation FROM jsonb_to_recordset($1::jsonb) r(kind text,id text,workspace_id uuid,customer_id uuid,generation bigint) LIMIT jsonb_array_length($1::jsonb))
  UNION
  SELECT linked.kind,linked.id,linked.workspace_id,linked.customer_id,NULL::bigint FROM original source CROSS JOIN LATERAL(
   SELECT link.kind,link.id,source.workspace_id,source.customer_id FROM profile_evidence_links evidence
    CROSS JOIN LATERAL(VALUES('verified_research',evidence.source_revision_id::text),('accepted_profile',evidence.supporting_profile_revision_id::text),('approved_excerpt',evidence.artifact_selection_id::text)) link(kind,id)
    WHERE evidence.profile_revision_id=CASE WHEN source.kind='accepted_profile' THEN source.id::uuid END AND link.id IS NOT NULL
   UNION ALL SELECT 'accepted_profile',selection.profile_revision_id::text,source.workspace_id,source.customer_id FROM artifact_evidence_selections selection
    WHERE selection.id=CASE WHEN source.kind='approved_excerpt' THEN source.id::uuid END AND selection.profile_revision_id IS NOT NULL
   UNION ALL SELECT lineage.source_kind,lineage.source_revision_id::text,contribution.workspace_id,contribution.customer_id FROM knowledge_lineage lineage
    JOIN knowledge_revisions revision ON revision.id=lineage.revision_id JOIN knowledge_contributions contribution ON contribution.id=revision.contribution_id
    WHERE lineage.revision_id=CASE WHEN source.kind='published_shared' THEN source.id::uuid END
  ) linked
 ) SELECT CASE source.kind
  WHEN 'accepted_profile' THEN EXISTS(SELECT 1 FROM profile_revisions revision JOIN profile_records record ON record.id=revision.record_id
   WHERE revision.id=source.id::uuid AND revision.workspace_id=source.workspace_id AND record.current_accepted_revision_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM profile_lifecycle_events event WHERE event.revision_id=revision.id AND event.event_type='retract'))
  WHEN 'verified_research' THEN EXISTS(SELECT 1 FROM evidence_source_revisions revision JOIN evidence_sources canonical ON canonical.id=revision.source_id AND canonical.origin='independent_research'
   JOIN research_checks checked ON checked.source_revision_id=revision.id AND checked.identity_result AND checked.scope_result AND checked.integrity_result AND checked.content_result
   JOIN LATERAL(SELECT id FROM evidence_source_revisions head WHERE head.source_id=canonical.id ORDER BY version DESC LIMIT 1) head ON true
   JOIN research_checks current_checked ON current_checked.source_revision_id=head.id AND current_checked.identity_result AND current_checked.scope_result AND current_checked.integrity_result AND current_checked.content_result
   WHERE revision.id=source.id::uuid AND revision.workspace_id=source.workspace_id AND NOT EXISTS(SELECT 1 FROM evidence_source_events event
    WHERE event.source_revision_id=revision.id AND event.event_type='withdraw'))
  WHEN 'approved_excerpt' THEN EXISTS(SELECT 1 FROM artifact_evidence_selections selection
   JOIN artifact_versions version ON version.id=selection.version_id AND version.lifecycle_generation=selection.lifecycle_generation AND version.sha256_digest=selection.original_digest AND version.state IN('ready','partial')
   JOIN artifact_extraction_runs run ON run.id=selection.run_id AND run.state='published' JOIN artifact_evidence_payloads payload ON payload.selection_id=selection.id
   WHERE selection.id=source.id::uuid AND selection.workspace_id=source.workspace_id AND selection.environment_id=$3)
  WHEN 'published_shared' THEN EXISTS(SELECT 1 FROM knowledge_revisions revision JOIN knowledge_revision_payloads payload ON payload.revision_id=revision.id
   JOIN knowledge_contributions contribution ON contribution.id=revision.contribution_id JOIN knowledge_publications publication ON publication.contribution_id=contribution.id AND publication.state='published'
   WHERE revision.id=source.id::uuid AND publication.environment_id=$3 AND ${sharedOriginSql('publication','$2')}
    AND NOT EXISTS(SELECT 1 FROM learning_release_decisions decision JOIN learning_review_states review ON review.review_id=decision.review_id JOIN learning_evaluations evaluation ON evaluation.id=decision.evaluation_id
     WHERE decision.revision_id=revision.id AND(source.generation IS NULL OR decision.publication_generation=source.generation) AND(review.revoked_at IS NOT NULL OR evaluation.invalidated_at IS NOT NULL))
    AND(EXISTS(SELECT 1 FROM learning_release_decisions decision JOIN learning_candidate_reviews review ON review.id=decision.review_id JOIN learning_review_states state ON state.review_id=review.id JOIN learning_evaluations evaluation ON evaluation.id=decision.evaluation_id
      WHERE decision.revision_id=revision.id AND(source.generation IS NULL OR decision.publication_generation=source.generation) AND decision.environment_id=publication.environment_id AND decision.workspace_id=contribution.workspace_id AND review.content_digest=revision.content_digest AND review.decision='accept' AND state.revoked_at IS NULL
       AND evaluation.state='passed' AND evaluation.invalidated_at IS NULL AND evaluation.revision_id=decision.revision_id AND evaluation.review_id=review.id AND evaluation.closure_digest=review.closure_digest)
     OR EXISTS(SELECT 1 FROM memberships member JOIN principals principal ON principal.id=member.principal_id AND principal.active JOIN workspaces workspace ON workspace.id=member.workspace_id AND workspace.active
      LEFT JOIN partner_organizations org ON org.id=member.partner_org_id LEFT JOIN customer_grants grant_row ON grant_row.membership_id=member.id AND grant_row.customer_id=contribution.customer_id AND grant_row.state='active'
      WHERE member.id=contribution.author_membership_id AND member.workspace_id=contribution.workspace_id AND member.active AND(member.kind='internal' OR(org.active AND grant_row.id IS NOT NULL))))
    AND EXISTS(SELECT 1 FROM knowledge_lineage lineage WHERE lineage.revision_id=revision.id))
  WHEN 'public_practice' THEN EXISTS(SELECT 1 FROM turas_evidence_snapshots snapshot JOIN turas_vercel_practice_sources mapping ON mapping.environment_id=snapshot.environment_id AND mapping.workspace_id=snapshot.workspace_id AND mapping.snapshot_id=snapshot.id
   WHERE snapshot.id=source.id AND snapshot.workspace_id=source.workspace_id::text AND snapshot.environment_id=$3
    AND(source.customer_id IS NOT NULL OR(mapping.source_type='vercel_documentation' AND snapshot.url LIKE 'https://vercel.com/docs/%' AND snapshot.url !~ '[?#]'))
)
  ELSE false END AS retained FROM original source LIMIT 1001`,
 [JSON.stringify(roots.map(root=>({kind:root.kind,id:root.id,workspace_id:root.workspaceId,customer_id:root.customerId??null,generation:root.generation??null}))),roots[0].workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
 if(rows.length>1000)throw new HttpFailure(422,'scope_too_large','Start a new conversation for current evidence');
 return rows.some(row=>!row.retained);
}
