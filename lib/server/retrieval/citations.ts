import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { citationLocatorSchema } from "../../contracts/retrieval";
import { passageDigest } from "./chunker";
import { authorizeRetrievalScope, recheckRetrievalSource } from "./policy";
import { getServerConfig } from "../config";
import { confirmedConflictAfter } from "./fences";

export async function resolveRetrievalCitation(client: PoolClient, actor: CurrentSession,
  citationId: string): Promise<{ citationId: string; text: string; locators: unknown[];
    asOf: string; validUntil: string }> {
  const found = await client.query<{
    citation_id: string; actor_membership_id: string; scope: "customer" | "shared" | "combined";
    customer_id: string | null; source_id: string; source_kind: string;
    source_revision_id: string; source_generation: string; content_digest: string;
    audience: string; projection_contract: string; passage_id: string; passage_digest: string;
    passage_text: string | null; locators: unknown; as_of: Date; valid_until: Date;
  }>(`SELECT c.id AS citation_id,r.actor_membership_id,r.scope,r.customer_id,
      c.source_id,c.source_kind,c.source_revision_id,c.source_generation,
      s.content_digest,s.audience,c.projection_contract,c.passage_id,c.passage_digest,
      p.passage_text,c.locators,r.as_of,least(r.valid_until,c.valid_until) AS valid_until
    FROM retrieval_receipt_sources c
    JOIN retrieval_receipts r ON r.id=c.receipt_id
    JOIN retrieval_sources s ON s.id=c.source_id
    LEFT JOIN retrieval_passages p ON p.id=c.passage_id AND p.source_id=c.source_id
      AND p.passage_digest=c.passage_digest
    WHERE c.id=$1 AND r.environment_id=$2 AND r.actor_membership_id=$3
      AND r.valid_until>now() AND c.valid_until>now()`,
  [citationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId]);
  const row = found.rows[0];
  if (!row || !row.passage_text || passageDigest(row.passage_text) !== row.passage_digest) {
    throw hiddenRecord();
  }
  const scope = await authorizeRetrievalScope(client,actor,row.scope,row.customer_id ?? undefined);
  if (await confirmedConflictAfter(client,row.source_kind,row.source_revision_id,row.as_of)) {
    throw hiddenRecord();
  }
  if (!await recheckRetrievalSource(client,{ id: row.source_id,kind: row.source_kind,
    revisionId: row.source_revision_id,generation: Number(row.source_generation),
    audience: row.audience,contentDigest: row.content_digest,
    projectionContract: row.projection_contract },scope)) throw hiddenRecord();
  const locators = citationLocatorSchema.array().min(1).max(50).safeParse(row.locators);
  if (!locators.success || row.passage_text.length > 2_000) throw hiddenRecord();
  return { citationId: row.citation_id,text: row.passage_text,locators: locators.data,
    asOf: row.as_of.toISOString(),validUntil: row.valid_until.toISOString() };
}
