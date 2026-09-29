import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import type { PoolClient } from "pg";

/** Bounded local maintenance. Read-time fences deny stale sources immediately. */
export async function runRetrievalCleanupTick(existingClient?: PoolClient): Promise<void> {
  const run = async (client: PoolClient) => {
    const ready = await client.query<{ schema_version: number }>(
      `SELECT schema_version FROM turas_environment WHERE environment_id=$1`,
      [getServerConfig().TURAS_ENVIRONMENT_ID]);
    if ((ready.rows[0]?.schema_version ?? 0) < 26) return;

    await client.query(`WITH expired AS (
      SELECT run.id,run.request_id FROM research_runs run
      JOIN research_requests req ON req.id=run.request_id
      WHERE run.environment_id=$1 AND run.state='queued'
        AND req.admission_deadline<now() ORDER BY req.admission_deadline LIMIT 100
      FOR UPDATE OF run SKIP LOCKED
    ), closed AS (
      UPDATE research_runs run SET state='failed',finished_at=now(),
        safe_reason_code='admission_expired',updated_at=now()
      FROM expired WHERE run.id=expired.id RETURNING expired.request_id
    ) UPDATE research_requests req SET state='expired',updated_at=now()
      FROM closed WHERE req.id=closed.request_id AND req.state='admitted'`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH expired AS (
      SELECT id FROM research_runs WHERE environment_id=$1 AND state='running'
        AND run_deadline<now() ORDER BY run_deadline LIMIT 100 FOR UPDATE SKIP LOCKED
    ) UPDATE research_runs run SET state='partial',finished_at=now(),
      safe_reason_code='deadline_exceeded',updated_at=now()
      FROM expired WHERE run.id=expired.id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH expired AS (
      SELECT operation.id,operation.run_id FROM research_operations operation
      JOIN research_runs run ON run.id=operation.run_id
      WHERE run.environment_id=$1 AND operation.state='dispatched'
        AND operation.deadline<now() ORDER BY operation.deadline LIMIT 100
      FOR UPDATE OF operation SKIP LOCKED
    ), uncertain AS (
      UPDATE research_operations operation SET state='unconfirmed',
        safe_error_code='operation_deadline',finished_at=now(),reserved_bytes=0
      FROM expired WHERE operation.id=expired.id RETURNING expired.run_id
    ) UPDATE research_runs run SET state='unconfirmed',finished_at=now(),
      safe_reason_code='provider_outcome_unconfirmed',updated_at=now()
      FROM uncertain WHERE run.id=uncertain.run_id AND run.state IN ('running','partial')`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH expired AS (
      SELECT payload.observation_id FROM research_observation_payloads payload
      JOIN research_observations observation ON observation.id=payload.observation_id
      JOIN research_runs run ON run.id=observation.run_id
      WHERE run.environment_id=$1 AND payload.raw_body_expires_at<now()
      ORDER BY payload.raw_body_expires_at LIMIT 100 FOR UPDATE OF payload SKIP LOCKED
    ) DELETE FROM research_observation_payloads payload USING expired
      WHERE payload.observation_id=expired.observation_id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH retired AS (
      SELECT payload.observation_id FROM research_observation_payloads payload
      JOIN research_observations observation ON observation.id=payload.observation_id
      JOIN research_runs run ON run.id=observation.run_id
      JOIN research_evidence_links link ON link.observation_id=observation.id
        AND link.linkage_state='attributed'
      JOIN evidence_source_events event ON event.source_revision_id=link.source_revision_id
        AND event.event_type IN ('withdraw','supersede')
      WHERE run.environment_id=$1
      ORDER BY payload.observation_id LIMIT 100 FOR UPDATE OF payload SKIP LOCKED
    ) DELETE FROM research_observation_payloads payload USING retired
      WHERE payload.observation_id=retired.observation_id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH retired AS (
      SELECT id FROM retrieval_sources WHERE environment_id=$1
        AND lifecycle_state IN ('retired','tombstoned')
        AND updated_at<now()-interval '60 seconds'
      ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM retrieval_passages passage USING retired
      WHERE passage.source_id=retired.id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`WITH expired AS (
      SELECT id FROM retrieval_embedding_operations WHERE environment_id=$1
        AND state IN ('succeeded','failed','unconfirmed')
        AND created_at<now()-interval '30 days'
      ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM retrieval_embedding_operations operation USING expired
      WHERE operation.id=expired.id`,
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
    await client.query(`SELECT turas_expire_retrieval_receipts()`);
  };
  if (existingClient) await run(existingClient);
  else await withTransaction(run);
}
