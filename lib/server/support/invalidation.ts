import type { PoolClient } from "pg";
import { getServerConfig } from "../config";

/** Indexed fanout inside original-source mutation; no impersonated user, model
 * context or prose retrieval. Read/release fences independently fail closed. */
export async function invalidateSupportSource(db: PoolClient, sourceKind: string, sourceRevisionId: string) {
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const marker = Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [env])).rows[0]?.schema_version ?? 0);
  if (marker < 42) return 0;
  const kind = sourceKind === "published_shared" ? "shared_knowledge" : sourceKind;
  const revisions = (await db.query(`SELECT DISTINCT v.id,v.ordinal FROM support_private_dependencies d
    JOIN support_revisions v ON v.id=d.revision_id JOIN support_records r ON r.id=v.record_id
    WHERE r.environment_id=$1 AND d.source_kind=$2 AND d.source_revision_id=$3
    UNION SELECT v.id,v.ordinal FROM support_revisions v JOIN support_records r ON r.id=v.record_id
      JOIN milestone_baselines b ON b.engagement_id=ANY(v.selected_engagement_ids)
      WHERE r.environment_id=$1 AND $2='milestone_baseline' AND b.id=$3`, [env, kind, sourceRevisionId])).rows;
  for (const revision of revisions) {
    await db.query("INSERT INTO support_invalidations(revision_id,cause_generation) VALUES($1,$2) ON CONFLICT DO NOTHING", [revision.id, revision.ordinal]);
    await queueSupportRevisionPurge(db, revision.id);
  }
  if (marker >= 43) await db.query(`INSERT INTO support_advice_retirements(attempt_id)
    SELECT DISTINCT a.id FROM support_advice_attempts a JOIN support_advice_dependencies d ON d.attempt_id=a.id
    WHERE a.environment_id=$1 AND d.kind=$2 AND (d.dependency_id=$3 OR d.revision_id=$3) ON CONFLICT DO NOTHING`, [env, kind, sourceRevisionId]);
  return revisions.length;
}

export async function queueSupportRevisionPurge(db: PoolClient, revisionId: string, immediate = false) {
  await db.query(`INSERT INTO support_cleanup_jobs(id,revision_id,payload_kind,content_digest,cause_generation,due_at)
    SELECT gen_random_uuid(),p.revision_id,'revision',p.content_digest,i.cause_generation,
      CASE WHEN $2 THEN clock_timestamp() ELSE i.created_at+interval '24 hours' END
    FROM support_payloads p JOIN support_invalidations i ON i.revision_id=p.revision_id WHERE p.revision_id=$1
      AND NOT EXISTS(SELECT 1 FROM support_cleanup_jobs j WHERE j.revision_id=p.revision_id AND j.payload_kind='revision')`, [revisionId, immediate]);
  await db.query(`INSERT INTO support_cleanup_jobs(id,decision_id,payload_kind,content_digest,cause_generation,due_at)
    SELECT gen_random_uuid(),d.id,'decision',encode(sha256(convert_to(p.rationale,'UTF8')),'hex'),i.cause_generation,
      CASE WHEN $2 THEN clock_timestamp() ELSE i.created_at+interval '24 hours' END
    FROM support_review_decisions d JOIN support_decision_payloads p ON p.decision_id=d.id
      JOIN support_invalidations i ON i.revision_id=d.revision_id WHERE d.revision_id=$1
      AND NOT EXISTS(SELECT 1 FROM support_cleanup_jobs j WHERE j.decision_id=d.id AND j.payload_kind='decision')`, [revisionId, immediate]);
  // A later retention cause may shorten an already queued invalidation deadline.
  // Preserve the current lease and identity; never move a deadline later.
  await db.query(`UPDATE support_cleanup_jobs j SET due_at=LEAST(j.due_at,
      CASE WHEN $2 THEN clock_timestamp() ELSE i.created_at+interval '24 hours' END)
    FROM support_invalidations i WHERE i.revision_id=$1 AND j.state<>'done' AND
      (j.revision_id=i.revision_id OR j.decision_id IN
        (SELECT d.id FROM support_review_decisions d WHERE d.revision_id=i.revision_id))`, [revisionId, immediate]);
}
