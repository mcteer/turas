import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { requireSupportEnvironment } from "./repository";
import { supportReceiptKeyHashes } from "./commands";
import { queueSupportRevisionPurge } from "./invalidation";

/** The database function uses the identical command mutex before deleting receipt
 * details and preserving environment-lifetime opaque retry fences. */
export async function expireSupportReceipts(limit = 100): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid support maintenance limit");
  return withTransaction(async db => {
    await requireSupportEnvironment(db);
    const rows = (await db.query(`SELECT id,environment_id,workspace_id,actor_membership_id,request_key
      FROM support_command_receipts WHERE environment_id=$1 AND created_at<now()-interval '365 days'
      ORDER BY created_at,id LIMIT $2`, [getServerConfig().TURAS_ENVIRONMENT_ID, limit])).rows;
    let expired = 0;
    for (const row of rows) {
      const hashes = supportReceiptKeyHashes(row.environment_id, row.workspace_id, row.actor_membership_id, row.request_key);
      if ((await db.query("SELECT turas_expire_support_receipt($1,$2::text[]) AS expired", [row.id, hashes])).rows[0].expired) expired++;
    }
    return expired;
  });
}

export async function runSupportCleanupTick(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid support cleanup limit");
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  await withTransaction(async db => {
    await requireSupportEnvironment(db);
    const aged = (await db.query(`SELECT v.id,v.ordinal FROM support_revisions v JOIN support_records r ON r.id=v.record_id
      JOIN support_payloads p ON p.revision_id=v.id WHERE r.environment_id=$1 AND v.created_at<=clock_timestamp()-interval '90 days'
      AND r.accepted_revision_id IS DISTINCT FROM v.id
      AND NOT EXISTS(SELECT 1 FROM support_review_decisions d WHERE d.revision_id=v.id AND d.decision='accept')
      ORDER BY v.created_at,v.id LIMIT $2`, [env, limit])).rows;
    for (const revision of aged) {
      await db.query("INSERT INTO support_invalidations(revision_id,cause_generation) VALUES($1,$2) ON CONFLICT DO NOTHING", [revision.id, revision.ordinal]);
      await queueSupportRevisionPurge(db, revision.id, true);
    }
    const invalidated = (await db.query(`SELECT i.revision_id FROM support_invalidations i JOIN support_revisions v ON v.id=i.revision_id
      JOIN support_records r ON r.id=v.record_id WHERE r.environment_id=$1 AND
      (EXISTS(SELECT 1 FROM support_payloads p WHERE p.revision_id=i.revision_id) OR
       EXISTS(SELECT 1 FROM support_review_decisions d JOIN support_decision_payloads p ON p.decision_id=d.id WHERE d.revision_id=i.revision_id))
      ORDER BY i.created_at,i.revision_id LIMIT $2`, [env, limit])).rows;
    for (const row of invalidated) await queueSupportRevisionPurge(db, row.revision_id);
  });
  const jobs = await withTransaction(async db => (await db.query(`WITH due AS (
      SELECT j.id FROM support_cleanup_jobs j LEFT JOIN support_review_decisions d ON d.id=j.decision_id
      JOIN support_revisions v ON v.id=COALESCE(j.revision_id,d.revision_id) JOIN support_records r ON r.id=v.record_id
      WHERE r.environment_id=$1 AND j.due_at<=clock_timestamp() AND j.attempts<10
        AND (j.state='pending' OR (j.state='leased' AND j.lease_until<=clock_timestamp()))
      ORDER BY j.due_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $2)
    UPDATE support_cleanup_jobs j SET state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
      FROM due WHERE j.id=due.id RETURNING j.id,j.lease_token`, [env, limit])).rows);
  let purged = 0;
  for (const job of jobs) if (await withTransaction(async db =>
    (await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [job.id, job.lease_token])).rows[0].purged)) purged++;
  return { claimed: jobs.length, purged };
}

export async function settleDueSupportAdvice() {
  return withTransaction(async db => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    await requireSupportEnvironment(db, false, true);
    return (await db.query(`UPDATE support_advice_attempts SET
      state=CASE WHEN state='prepared' THEN 'expired' ELSE 'unconfirmed' END,
      failure_code=CASE WHEN state='prepared' THEN 'preparation_expired' ELSE 'receipt_unavailable' END,
      settled_at=COALESCE(settled_at,deadline_at,created_at+interval '5 minutes'),updated_at=clock_timestamp()
      WHERE environment_id=$1 AND ((state='prepared' AND response_attempt_id IS NULL AND created_at<=clock_timestamp()-interval '5 minutes')
        OR (state='running' AND deadline_at<=clock_timestamp())) RETURNING id`, [env])).rowCount ?? 0;
  });
}

export async function runSupportAdviceCleanupTick(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid support advice cleanup limit");
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const jobs = await withTransaction(async db => {
    await requireSupportEnvironment(db, false, true);
    await db.query(`INSERT INTO support_advice_cleanup_jobs(id,attempt_id,request_digest,due_at)
      SELECT gen_random_uuid(),a.id,a.request_digest,
        LEAST(LEAST(COALESCE(a.settled_at,'infinity'::timestamptz),COALESCE(a.deadline_at,'infinity'::timestamptz))+interval '30 days',
          COALESCE(r.retired_at+interval '24 hours','infinity'::timestamptz))
      FROM support_advice_attempts a LEFT JOIN support_advice_retirements r ON r.attempt_id=a.id
      WHERE a.environment_id=$1 AND (a.settled_at IS NOT NULL OR a.deadline_at IS NOT NULL OR r.attempt_id IS NOT NULL)
        AND EXISTS(SELECT 1 FROM support_advice_payloads p WHERE p.attempt_id=a.id)
      ON CONFLICT(attempt_id) DO UPDATE SET due_at=LEAST(support_advice_cleanup_jobs.due_at,EXCLUDED.due_at)`, [env]);
    return (await db.query(`WITH due AS(SELECT j.id FROM support_advice_cleanup_jobs j JOIN support_advice_attempts a ON a.id=j.attempt_id
        WHERE a.environment_id=$1 AND j.due_at<=clock_timestamp() AND (j.state='pending' OR (j.state='leased' AND j.lease_until<=clock_timestamp()))
        ORDER BY j.due_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $2)
      UPDATE support_advice_cleanup_jobs j SET state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
      FROM due WHERE j.id=due.id RETURNING j.id,j.lease_token`, [env, limit])).rows;
  });
  let purged = 0;
  for (const job of jobs) if (await withTransaction(async db =>
    (await db.query("SELECT turas_purge_support_advice($1,$2) AS purged", [job.id, job.lease_token])).rows[0].purged)) purged++;
  return { claimed: jobs.length, purged };
}

export async function minimizeSupportAudit(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid support audit limit");
  return withTransaction(async db => {
    await requireSupportEnvironment(db);
    return Number((await db.query("SELECT turas_minimize_support_audit($1,$2) AS minimized", [getServerConfig().TURAS_ENVIRONMENT_ID, limit])).rows[0].minimized);
  });
}
