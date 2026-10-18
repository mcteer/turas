import type {PoolClient} from "pg";
import {getServerConfig} from "../config";
import {unsupportedProfileRevisionIds} from "../profiles/eligibility";
/** An admitted research turn can finish after its own checked public writes.
 * Other actors, manual facts and authorization changes never receive this bridge.
 * Original context receipts remain immutable and original citations stay checked. */
export async function ownResearchGenerationIsCurrent(client:PoolClient,input:{attemptId:string;conversationId:string;customerId:string;workspaceId:string;membershipId:string;sessionId:string;generation:string;current:string|undefined}):Promise<boolean>{
 if(input.current===input.generation)return true;
 if(!input.current||!/^\d+$/.test(input.current)||!/^\d+$/.test(input.generation))return false;
 const delta=BigInt(input.current)-BigInt(input.generation);if(delta<1n||delta>8n)return false;
 if(!(await client.query("SELECT to_regclass('research_runs') IS NOT NULL AS ready")).rows[0]?.ready)return false;
 const owned=await client.query<{count:string;source_ids:string[]}>(`SELECT count(DISTINCT l.source_revision_id)::text AS count,array_agg(DISTINCT v.source_id) AS source_ids
  FROM research_runs run JOIN research_requests req ON req.id=run.request_id
  JOIN research_observations o ON o.run_id=run.id AND o.origin='independent_discovery'
    AND o.identity_checked AND o.scope_checked AND o.integrity_checked AND o.content_checked
  JOIN research_evidence_links l ON l.observation_id=o.id AND l.linkage_state='attributed'
  JOIN evidence_source_revisions v ON v.id=l.source_revision_id AND v.workspace_id=run.workspace_id AND v.customer_id=run.customer_id
  JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
  JOIN research_checks checked ON checked.source_revision_id=v.id AND checked.trusted_ingest_identity='public-fetch-v1:observation:'||o.id::text AND checked.identity_result AND checked.scope_result AND checked.integrity_result AND checked.content_result
  WHERE run.conversation_attempt_id=$1 AND run.environment_id=$2 AND req.conversation_id=$3
    AND run.customer_id=$4 AND run.workspace_id=$5 AND run.actor_membership_id=$6 AND req.login_session_id=$7
    AND run.state IN('running','completed','partial')`,[input.attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,input.conversationId,input.customerId,input.workspaceId,input.membershipId,input.sessionId]);
 if(BigInt(owned.rows[0]?.count??'0')!==delta)return false;
 const sourceIds=owned.rows[0]?.source_ids??[];
 const invalid=await client.query(`SELECT 1 FROM evidence_source_revisions v
  JOIN evidence_sources s ON s.id=v.source_id LEFT JOIN research_checks checked ON checked.source_revision_id=v.id
  WHERE v.source_id=ANY($1::uuid[]) AND v.version=(SELECT max(newest.version) FROM evidence_source_revisions newest WHERE newest.source_id=v.source_id)
    AND (s.origin<>'independent_research' OR NOT COALESCE(checked.identity_result AND checked.scope_result AND checked.integrity_result AND checked.content_result,false)
      OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede')))
  LIMIT 1`,[sourceIds]);if(invalid.rowCount)return false;
 const typed=(await client.query("SELECT to_regclass('evidence_conflict_targets') IS NOT NULL AS ready")).rows[0]?.ready;
 if(typed&&(await client.query(`SELECT 1 FROM evidence_conflict_targets conflict JOIN evidence_source_revisions v ON v.source_id=ANY($1::uuid[])
   AND v.version=(SELECT max(newest.version) FROM evidence_source_revisions newest WHERE newest.source_id=v.source_id)
   WHERE conflict.state='confirmed' AND conflict.environment_id=$2 AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=v.id) OR (conflict.second_kind='verified_research' AND conflict.second_revision_id=v.id)) LIMIT 1`,[sourceIds,getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount)return false;
 const receipt=(await client.query(`SELECT r.snapshot FROM context_snapshot_receipts r
   JOIN login_sessions login ON login.id=r.login_session_id AND login.revoked_at IS NULL AND login.expires_at>now()
   JOIN principals principal ON principal.id=login.principal_id AND principal.active
   JOIN memberships member ON member.id=r.membership_id AND member.principal_id=principal.id AND member.workspace_id=r.workspace_id AND member.active
   JOIN workspaces workspace ON workspace.id=r.workspace_id AND workspace.active
   LEFT JOIN partner_organizations organization ON organization.id=member.partner_org_id
   LEFT JOIN customer_grants grant_row ON grant_row.customer_id=r.customer_id AND grant_row.membership_id=member.id
   WHERE r.attempt_id=$1 AND r.conversation_id=$2 AND r.customer_id=$3 AND r.workspace_id=$4
     AND r.membership_id=$5 AND r.login_session_id=$6 AND r.generation=$7 AND r.environment_id=$8 AND r.valid_until>now()
     AND (member.kind='internal' OR (member.kind='partner' AND organization.active AND grant_row.state='active'))`,
   [input.attemptId,input.conversationId,input.customerId,input.workspaceId,input.membershipId,input.sessionId,input.generation,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.snapshot;
 if(!receipt)return false;
 const manual=(receipt.entries??[]).filter((entry:{type?:string})=>entry.type==='accepted_manual').map((entry:{citationId:string})=>entry.citationId);
 if(manual.length&&(await unsupportedProfileRevisionIds(client,manual,true)).size)return false;
 return true;
}
