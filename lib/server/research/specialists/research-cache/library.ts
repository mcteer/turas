import {getServerConfig} from "../../../config";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import {lockProfileActor} from "../../../profiles/policy";
import {withTransaction} from "../../../db/client";
import {researchSourceIsEligibleInTransaction} from "../account";
import {HttpFailure,hiddenRecord} from "../../../../contracts/http";
import { sourceSchema } from "../solution-research/schema";
import { verifiedPublicationDate } from "../solution-research/source-integrity";


export async function sourceLibrary(identity: AppIdentity, accountId: string, signal: AbortSignal, offset = 0) {
  if(identity.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID)throw hiddenRecord();
  if(!Number.isInteger(offset)||offset<0||offset>100000)throw new HttpFailure(400,"invalid_offset","Invalid source-library offset");
  return withTransaction(async db=>{
  await lockProfileActor(db,identity,accountId,undefined,true);
  signal.throwIfAborted();
  const result = await db.query(`SELECT s.id,s.source,s.truncated,s.checked_at,s.refresh_after,s.index_state,
      array_agg(DISTINCT CASE WHEN a.owner_user_id=$3 THEN a.workload ELSE 'Public source' END
        ORDER BY CASE WHEN a.owner_user_id=$3 THEN a.workload ELSE 'Public source' END) AS workloads
    FROM turas_evidence_snapshots s JOIN turas_evidence_accounts a
      ON a.environment_id=s.environment_id AND a.workspace_id=s.workspace_id AND a.snapshot_id=s.id
    WHERE a.environment_id=$1 AND a.workspace_id=$2 AND (a.owner_user_id=$3 OR a.visibility='public') AND a.account_id=$4
      AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots n WHERE n.environment_id=s.environment_id AND n.workspace_id=s.workspace_id
        AND n.fetch_key=s.fetch_key AND (n.checked_at>s.checked_at OR (n.checked_at=s.checked_at AND n.id>s.id)))
      AND NOT EXISTS(SELECT 1 FROM evidence_sources canonical
        LEFT JOIN LATERAL(SELECT * FROM evidence_source_revisions v WHERE v.source_id=canonical.id ORDER BY v.version DESC LIMIT 1) head ON true
        WHERE canonical.workspace_id=$2::uuid AND canonical.customer_id=$4::uuid AND canonical.origin='independent_research'
          AND canonical.canonical_location=s.url AND (head.id IS NULL OR ($6='partner' AND head.audience<>'delivery')
            OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=head.id AND e.event_type IN('withdraw','supersede'))
            OR NOT EXISTS(SELECT 1 FROM research_checks checks WHERE checks.source_revision_id=head.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result)
            OR EXISTS(SELECT 1 FROM independent_research_documents document WHERE document.source_revision_id=head.id AND encode(sha256(convert_to(document.document_text,'UTF8')),'hex')<>document.document_digest)
            OR EXISTS(SELECT 1 FROM evidence_conflict_targets conflict WHERE conflict.environment_id=$1 AND conflict.state='confirmed'
              AND (conflict.scope='shared' OR (conflict.scope='customer' AND conflict.workspace_id=canonical.workspace_id AND conflict.customer_id=canonical.customer_id))
              AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=head.id) OR
                (conflict.second_kind='verified_research' AND conflict.second_revision_id=head.id)))))
    GROUP BY s.environment_id,s.workspace_id,s.id ORDER BY s.checked_at DESC,s.id LIMIT 21 OFFSET $5`,
    [identity.environmentId, identity.workspaceId, identity.userId, accountId, offset,identity.kind]);
  signal.throwIfAborted();
  const sources = z.array(z.object({ id: z.string(), source: sourceSchema, truncated: z.boolean(), checked_at: z.coerce.date(),
    refresh_after: z.coerce.date(), index_state: z.string(), workloads: z.array(z.string()) })).parse(result.rows);
  const eligible=[];
  for(const row of sources){
    signal.throwIfAborted();
    if(await researchSourceIsEligibleInTransaction(db,identity,accountId,row.source.url)){
      const revision=(await db.query<{id:string}>(`SELECT v.id FROM evidence_sources s JOIN evidence_source_revisions v ON v.source_id=s.id
        WHERE s.workspace_id=$1 AND s.customer_id=$2 AND s.origin='independent_research' AND s.canonical_location=$3
        ORDER BY v.version DESC LIMIT 1`,[identity.workspaceId,accountId,row.source.url])).rows[0];
      eligible.push({...row,sourceRevisionId:revision?.id??null});
    }
  }
  return { more: eligible.length > 20, sources: eligible.slice(0, 20).map(row => ({sourceRevisionId:row.sourceRevisionId, id: row.id, url: row.source.url, title: row.source.title,
    publishedAt: verifiedPublicationDate(row.source), checkedAt: row.checked_at.toISOString(), refreshAfter: row.refresh_after.toISOString(),
    refreshDue: row.refresh_after.getTime() <= Date.now(), truncated: row.truncated, indexState: row.index_state, workloads: row.workloads })) };
  });
}
