import { getServerConfig } from "../lib/server/config";
import { withTransaction } from "../lib/server/db/client";
import { claimRetrievalJobs, finishRetrievalJob, renewRetrievalLease,
  type RetrievalJobClaim } from "../lib/server/retrieval/jobs";
import { embedRetrievalTexts } from "../lib/server/retrieval/embeddings";
import { recordRetrievalMetric } from "../lib/server/retrieval/telemetry";
import { exactRetrievalOriginalCurrent } from "../lib/server/retrieval/fences";
import { retrievalIntakeEnabled } from "../lib/server/retrieval/policy";
import type { PoolClient } from "pg";

type IndexPassage = { id: string; passage_text: string; passage_digest: string };

export async function currentIndexPassages(claim: RetrievalJobClaim,
  existingClient?: PoolClient): Promise<IndexPassage[] | null> {
  const run = async (client: PoolClient) => {
    const marker=(await client.query<{schema_version:number}>("SELECT schema_version FROM turas_environment WHERE environment_id=$1",[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    // The immutable operator receipt scopes public eligibility. Original-current
    // checks below still require independent origin, successful revision checks and no withdrawal.
    const publicBatchProof=marker?.schema_version>=45?`EXISTS(SELECT 1 FROM public_customer_research_results r
      JOIN evidence_source_revisions v ON v.id=s.source_revision_id AND v.workspace_id=s.workspace_id AND v.customer_id=s.customer_id
      JOIN evidence_sources e ON e.id=v.source_id
      WHERE r.environment_id=s.environment_id AND r.workspace_id=s.workspace_id AND r.customer_id=s.customer_id
        AND v.id=ANY(r.source_revision_ids) AND e.origin='independent_research')`:"false";
    const source = await client.query<{ synthetic: boolean | null; scope: string; public_batch:boolean;
      source_kind: string; source_revision_id: string; source_generation: string }>(`
      SELECT c.synthetic,s.scope,s.source_kind,s.source_revision_id,s.source_generation,
        CASE WHEN s.source_kind='verified_research' THEN ${publicBatchProof} ELSE false END AS public_batch
      FROM retrieval_jobs j
      JOIN retrieval_sources s ON s.id=j.source_id AND s.source_generation=j.source_generation
        AND s.contract_digest=j.contract_digest AND s.lifecycle_state='current'
      LEFT JOIN customer_references c ON c.id=s.customer_id AND c.workspace_id=s.workspace_id
      WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>now()
        AND j.state='leased' AND j.kind='index'`, [claim.id,claim.leaseToken]);
    const row = source.rows[0];
    if (!row || !(row.synthetic || row.scope === "shared" || row.public_batch) ||
        !await exactRetrievalOriginalCurrent(client,row.source_kind,
          row.source_revision_id,row.source_generation)) return null;
    const passages = await client.query<IndexPassage>(`
      SELECT p.id,p.passage_text,p.passage_digest
      FROM retrieval_passages p WHERE p.source_id=$1 ORDER BY p.ordinal`, [claim.sourceId]);
    return passages.rows;
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

async function runIndex(claim: RetrievalJobClaim): Promise<void> {
  const passages = await currentIndexPassages(claim);
  if (!passages?.length) {
    await withTransaction((client) => finishRetrievalJob(client,claim,"failed","source_not_eligible"));
    return;
  }
  try {
    for (let offset = 0; offset < passages.length; offset += 32) {
      if (!await withTransaction((client) => renewRetrievalLease(client,claim))) {
        throw new Error("stale_lease");
      }
      const batch = passages.slice(offset,offset+32);
      const vectors = await embedRetrievalTexts(batch.map((passage) => passage.passage_text),{
        jobId: claim.id,operationKey: `${claim.id}:${claim.attempt}:${offset}`,
      });
      const committed = await withTransaction(async (client) => {
        const current = await client.query<{ source_kind: string;
          source_revision_id: string; source_generation: string }>(`
          SELECT s.source_kind,s.source_revision_id,s.source_generation FROM retrieval_jobs j
          JOIN retrieval_sources s ON s.id=j.source_id
          WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>now()
            AND j.state='leased' AND s.source_generation=$3 AND s.contract_digest=$4
            AND s.lifecycle_state='current' FOR UPDATE OF j,s`,
        [claim.id,claim.leaseToken,claim.generation,claim.contractDigest]);
        const row = current.rows[0];
        if (!row || !await exactRetrievalOriginalCurrent(client,row.source_kind,
          row.source_revision_id,row.source_generation)) return false;
        for (const [index,passage] of batch.entries()) {
          const updated = await client.query(`UPDATE retrieval_passages
            SET embedding=$4::public.vector,embedding_state='ready',
              embedding_contract='embedding-v1',embedded_at=now()
            WHERE id=$1 AND source_id=$2 AND passage_digest=$3`,
          [passage.id,claim.sourceId,passage.passage_digest,`[${vectors[index].join(",")}]`]);
          if (updated.rowCount !== 1) throw new Error("passage_changed");
        }
        return true;
      });
      if (!committed) throw new Error("stale_generation");
    }
    await withTransaction(async (client) => {
      if (!await renewRetrievalLease(client,claim)) return false;
      return finishRetrievalJob(client,claim,"completed");
    });
  } catch {
    await withTransaction(async (client) => {
      const unknown = await client.query(`SELECT 1 FROM retrieval_embedding_operations
        WHERE job_id=$1 AND state='unconfirmed' LIMIT 1`, [claim.id]);
      await finishRetrievalJob(client,claim,unknown.rowCount ? "unconfirmed" : "failed",
        unknown.rowCount ? "embedding_unconfirmed" : "index_failed");
    });
  }
}

async function runLifecycle(claim: RetrievalJobClaim): Promise<void> {
  await withTransaction(async (client) => {
    const job = await client.query<{ lifecycle_state: string }>(`SELECT s.lifecycle_state FROM retrieval_jobs j
      JOIN retrieval_sources s ON s.id=j.source_id
      WHERE j.id=$1 AND j.lease_token=$2 AND j.lease_until>now()
        AND j.state='leased' AND s.source_generation=$3 AND s.contract_digest=$4
      FOR UPDATE OF j,s`, [claim.id,claim.leaseToken,claim.generation,claim.contractDigest]);
    if (!job.rowCount) return;
    if (claim.kind === "invalidate") {
      await client.query(`UPDATE retrieval_sources SET lifecycle_state='retired',updated_at=now()
        WHERE id=$1 AND source_generation=$2 AND contract_digest=$3`,
      [claim.sourceId,claim.generation,claim.contractDigest]);
    } else {
      if (!['retired','tombstoned'].includes(job.rows[0].lifecycle_state)) {
        await finishRetrievalJob(client,claim,"failed","cleanup_not_eligible");
        return;
      }
      await client.query(`DELETE FROM retrieval_passages p
        USING retrieval_sources s WHERE p.source_id=$1 AND s.id=p.source_id
          AND s.lifecycle_state IN ('retired','tombstoned')`);
    }
    await finishRetrievalJob(client,claim,"completed");
  });
}

/** One bounded lane in the existing maintenance process; research stays in eve. */
export async function runRetrievalWorkerTick(sourceIds?: readonly string[]): Promise<void> {
  if (!retrievalIntakeEnabled()) return;
  const claims = await claimRetrievalJobs(2,undefined,getServerConfig().TURAS_ENVIRONMENT_ID,sourceIds);
  await Promise.all(claims.map(async (claim) => {
    const started = Date.now();
    try {
      if (claim.kind === "index") await runIndex(claim);
      else await runLifecycle(claim);
    } catch {
      // The lease expires; the next claim classifies dispatched paid work as unconfirmed.
    } finally {
      recordRetrievalMetric("index_duration_ms",Date.now()-started);
    }
  }));
}
