import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { assertRetrievalReady } from "./policy";
import { embeddingContractVersion } from "../../contracts/retrieval";
import { exactRetrievalOriginalCurrent } from "./fences";

export type RetrievalJobKind = "index" | "invalidate" | "cleanup";
export type RetrievalJobClaim = {
  id: string; sourceId: string; generation: number; contractDigest: string;
  kind: RetrievalJobKind; leaseToken: string; attempt: number;
};

export async function enqueueRetrievalJob(client: PoolClient, sourceId: string,
  kind: RetrievalJobKind, environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<string | null> {
  await assertRetrievalReady(client,environmentId);
  const source = await client.query<{ environment_id: string; source_generation: string;
    contract_digest: string; lifecycle_state: string }>(
    `SELECT environment_id,source_generation,contract_digest,lifecycle_state
     FROM retrieval_sources WHERE id=$1 FOR UPDATE`, [sourceId]);
  const row = source.rows[0];
  if (!row || row.environment_id !== environmentId) return null;
  if (kind === "index" && row.lifecycle_state !== "current") return null;
  const jobId = randomUUID();
  const created = await client.query<{ id: string }>(`
    INSERT INTO retrieval_jobs(id,environment_id,source_id,source_generation,contract_digest,kind,state)
    VALUES($1,$2,$3,$4,$5,$6,'queued')
    ON CONFLICT (environment_id,source_id,source_generation,contract_digest,kind)
      DO UPDATE SET updated_at=retrieval_jobs.updated_at
    RETURNING id`, [jobId,row.environment_id,sourceId,row.source_generation,row.contract_digest,kind]);
  return created.rows[0]?.id ?? null;
}

/** Operator retry stays within the original three-attempt generation budget. */
export async function retryFailedRetrievalJob(client: PoolClient,jobId: string): Promise<boolean> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  await assertRetrievalReady(client,environmentId);
  const found = await client.query<{ state: string; attempts: number; kind: RetrievalJobKind;
    source_generation: string; contract_digest: string; source_kind: string;
    source_revision_id: string; lifecycle_state: string;
    current_generation: string; current_contract_digest: string }>(`
    SELECT j.state,j.attempts,j.kind,j.source_generation,j.contract_digest,
      s.source_kind,s.source_revision_id,s.lifecycle_state,
      s.source_generation AS current_generation,s.contract_digest AS current_contract_digest
    FROM retrieval_jobs j JOIN retrieval_sources s ON s.id=j.source_id
    WHERE j.id=$1 AND j.environment_id=$2 AND s.environment_id=$2
    FOR UPDATE OF j,s`,[jobId,environmentId]);
  const row = found.rows[0];
  if (!row || row.state !== "failed" || row.attempts >= 3 ||
      row.source_generation !== row.current_generation ||
      row.contract_digest !== row.current_contract_digest) return false;
  const ambiguous = await client.query(`SELECT 1 FROM retrieval_embedding_operations
    WHERE job_id=$1 AND state IN ('dispatched','unconfirmed') LIMIT 1`,[jobId]);
  if (ambiguous.rowCount) return false;
  if (row.kind === "index" && (row.lifecycle_state !== "current" ||
      !await exactRetrievalOriginalCurrent(client,row.source_kind,
        row.source_revision_id,row.source_generation))) return false;
  const retried = await client.query(`UPDATE retrieval_jobs SET state='queued',
    last_error_code='operator_retry',updated_at=now()
    WHERE id=$1 AND state='failed' AND attempts<3`,[jobId]);
  return retried.rowCount === 1;
}

export async function claimRetrievalJobs(limit = 2, existingClient?: PoolClient,
  environmentId = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<RetrievalJobClaim[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2) throw new Error("Invalid retrieval worker concurrency");
  const execute = async (client: PoolClient) => {
    await assertRetrievalReady(client,environmentId);
    const candidates = await client.query<{
      id: string; source_id: string; source_generation: string; contract_digest: string;
      kind: RetrievalJobKind; state: string; attempts: number;
    }>(`SELECT id,source_id,source_generation,contract_digest,kind,state,attempts
      FROM retrieval_jobs WHERE environment_id=$1 AND
        (state='queued' OR (state='leased' AND lease_until<=now()))
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`, [environmentId,limit]);
    const claims: RetrievalJobClaim[] = [];
    for (const job of candidates.rows) {
      const source = await client.query<{ source_generation: string; contract_digest: string;
        lifecycle_state: string }>(`SELECT source_generation,contract_digest,lifecycle_state
        FROM retrieval_sources WHERE id=$1 AND environment_id=$2 FOR UPDATE`,
      [job.source_id,environmentId]);
      const current = source.rows[0];
      const eligible = current && current.source_generation === job.source_generation &&
        current.contract_digest === job.contract_digest &&
        (job.kind !== "index" || current.lifecycle_state === "current");
      const inFlight = job.state === "leased" && (await client.query(`SELECT 1
        FROM retrieval_embedding_operations WHERE job_id=$1 AND state='dispatched' LIMIT 1`,
      [job.id])).rowCount;
      if (!eligible || inFlight || job.attempts >= 3) {
        await client.query(`UPDATE retrieval_jobs SET state=$2,lease_token=NULL,
          lease_started_at=NULL,lease_until=NULL,last_error_code=$3,updated_at=now()
          WHERE id=$1`, [job.id,inFlight ? "unconfirmed" : "failed",
          inFlight ? "ambiguous_embedding_dispatch" : eligible ? "attempts_exhausted" : "stale_generation"]);
        if (inFlight) await client.query(`UPDATE retrieval_embedding_operations
          SET state='unconfirmed',completed_at=now()
          WHERE job_id=$1 AND state='dispatched'`, [job.id]);
        continue;
      }
      const token = randomUUID();
      const claim = await client.query<{ attempts: number }>(`UPDATE retrieval_jobs
        SET state='leased',attempts=attempts+1,lease_token=$2,
          lease_started_at=now(),lease_until=now()+interval '30 seconds',updated_at=now()
        WHERE id=$1 RETURNING attempts`, [job.id,token]);
      claims.push({ id: job.id,sourceId: job.source_id,generation: Number(job.source_generation),
        contractDigest: job.contract_digest,kind: job.kind,leaseToken: token,
        attempt: claim.rows[0].attempts });
    }
    return claims;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

export async function finishRetrievalJob(client: PoolClient, claim: RetrievalJobClaim,
  state: "completed" | "failed" | "unconfirmed", errorCode?: string): Promise<boolean> {
  const finished = await client.query(`UPDATE retrieval_jobs j SET state=$6,
    lease_token=NULL,lease_started_at=NULL,lease_until=NULL,last_error_code=$7,updated_at=now()
    FROM retrieval_sources s WHERE j.id=$1 AND s.id=j.source_id
      AND j.source_id=$2 AND j.source_generation=$3 AND j.contract_digest=$4
      AND j.lease_token=$5 AND j.state='leased' AND j.lease_until>now()
      AND s.source_generation=j.source_generation AND s.contract_digest=j.contract_digest
      AND (j.kind<>'index' OR s.lifecycle_state='current')`,
  [claim.id,claim.sourceId,claim.generation,claim.contractDigest,
    claim.leaseToken,state,errorCode ?? null]);
  return finished.rowCount === 1;
}

export async function renewRetrievalLease(client: PoolClient,
  claim: RetrievalJobClaim): Promise<boolean> {
  const result = await client.query(`UPDATE retrieval_jobs j SET
    lease_started_at=now(),lease_until=now()+interval '30 seconds',updated_at=now()
    FROM retrieval_sources s WHERE j.id=$1 AND j.source_id=s.id
      AND j.lease_token=$2 AND j.state='leased' AND j.lease_until>now()
      AND s.source_generation=$3 AND s.contract_digest=$4
      AND s.lifecycle_state='current'`,
  [claim.id,claim.leaseToken,claim.generation,claim.contractDigest]);
  return result.rowCount === 1;
}

export async function reserveEmbeddingOperation(client: PoolClient, input: {
  jobId: string | null; operationKey: string; inputCharacters: number; modelId: string;
}): Promise<{ id: string; state: string }> {
  if (!Number.isInteger(input.inputCharacters) || input.inputCharacters < 1 ||
      input.inputCharacters > 64_000 || input.operationKey.length < 1 ||
      input.operationKey.length > 128) throw new Error("Invalid embedding operation budget");
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const inserted = await client.query<{ id: string; state: string }>(`
    INSERT INTO retrieval_embedding_operations
      (id,environment_id,job_id,operation_kind,operation_key,state,embedding_contract,
       model_id,dimensions,input_characters)
    VALUES($1,$2,$3,$4,$5,'reserved',$6,$7,1536,$8)
    ON CONFLICT (environment_id,operation_key) DO NOTHING
    RETURNING id,state`,
  [randomUUID(),environmentId,input.jobId,input.jobId ? "index" : "query",
    input.operationKey,embeddingContractVersion,input.modelId,input.inputCharacters]);
  if (inserted.rows[0]) return inserted.rows[0];
  const replay = await client.query<{ id: string; state: string; job_id: string | null;
    input_characters: number; model_id: string }>(`SELECT id,state,job_id,input_characters,model_id
    FROM retrieval_embedding_operations WHERE environment_id=$1 AND operation_key=$2`,
  [environmentId,input.operationKey]);
  const row = replay.rows[0];
  if (!row || row.job_id !== input.jobId || row.input_characters !== input.inputCharacters ||
      row.model_id !== input.modelId) throw new Error("Embedding operation key reused with different input");
  return { id: row.id,state: row.state };
}

/** Persist this marker before network dispatch; replay never sends it again. */
export async function markEmbeddingDispatched(client: PoolClient, operationId: string): Promise<boolean> {
  const result = await client.query(`UPDATE retrieval_embedding_operations
    SET state='dispatched',dispatched_at=now()
    WHERE id=$1 AND state='reserved' AND environment_id=$2`,
  [operationId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  return result.rowCount === 1;
}

export async function finishEmbeddingOperation(client: PoolClient, operationId: string,
  state: "succeeded" | "failed" | "unconfirmed", providerReceiptId?: string): Promise<boolean> {
  const result = await client.query(`UPDATE retrieval_embedding_operations
    SET state=$2,provider_receipt_id=$3,completed_at=now()
    WHERE id=$1 AND state='dispatched' AND environment_id=$4`,
  [operationId,state,providerReceiptId ?? null,getServerConfig().TURAS_ENVIRONMENT_ID]);
  return result.rowCount === 1;
}
