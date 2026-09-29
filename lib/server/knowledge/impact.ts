import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { authorizeRetrievalScope } from "../retrieval/policy";
import { requireKnowledgePublisher } from "./policy";

/** Content-free publication and cleanup impact for active administrators. */
export async function readKnowledgeImpact(client: PoolClient,actor: CurrentSession) {
  await authorizeRetrievalScope(client,actor,"shared");
  requireKnowledgePublisher(actor);
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const [publication,cleanup] = await Promise.all([
    client.query<{ state: string; count: string }>(`
      SELECT state,count(*)::text AS count FROM knowledge_publications
      WHERE environment_id=$1 AND state IN ('published','suspended','withdrawn')
      GROUP BY state`,[environmentId]),
    client.query<{ state: string; count: string }>(`
      SELECT job.state,count(*)::text AS count FROM retrieval_jobs job
      JOIN retrieval_sources source ON source.id=job.source_id
      WHERE job.environment_id=$1 AND source.environment_id=$1
        AND job.kind='cleanup' AND source.source_kind='published_shared'
      GROUP BY job.state`,[environmentId]),
  ]);
  const publications = Object.fromEntries(publication.rows.map((row) =>
    [row.state,Number(row.count)]));
  const cleanupJobs = Object.fromEntries(cleanup.rows.map((row) =>
    [row.state,Number(row.count)]));
  return { publications: {
    published: publications.published ?? 0,suspended: publications.suspended ?? 0,
    withdrawn: publications.withdrawn ?? 0,
  },cleanupJobs: {
    queued: cleanupJobs.queued ?? 0,leased: cleanupJobs.leased ?? 0,
    failed: cleanupJobs.failed ?? 0,unconfirmed: cleanupJobs.unconfirmed ?? 0,
  } };
}
