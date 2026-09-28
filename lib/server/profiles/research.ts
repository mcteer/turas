import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { qualityInputSchema } from "../../contracts/profiles";
import { getServerConfig } from "../config";
import { rateEvidence } from "./quality";

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    url.hostname !== "localhost" && !url.hostname.endsWith(".localhost") &&
    !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(url.hostname);
});
const instant = z.iso.datetime({ offset: true });
const checkSchema = z.object({
  identity: z.literal(true), scope: z.literal(true), integrity: z.literal(true), content: z.literal(true),
  rationale: z.string().trim().min(1).max(2_000), checkVersion: z.literal("research-check-v1"),
}).strict();
const ingestSchema = z.object({
  workspaceId: z.uuid(), customerId: z.uuid(), trustedIdentity: z.literal("synthetic-fixture-v1"),
  location: httpsUrl, title: z.string().trim().min(1).max(160),
  passage: z.string().trim().min(1).max(8_000), supportedClaim: z.string().trim().min(1).max(8_000),
  publicationAt: instant.optional(), observationAt: instant.optional(), eventAt: instant.optional(),
  retrievalAt: instant, rights: z.string().trim().min(1).max(500),
  audience: z.enum(["internal", "delivery"]), qualityInput: qualityInputSchema, checks: checkSchema,
}).strict();
export type ResearchIngest = z.infer<typeof ingestSchema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type PriorRevision = {
  id: string; source_id: string; version: string; title: string; passage_digest: string;
  supported_claim: string; publication_at: Date | null; observation_at: Date | null;
  event_at: Date | null; retrieval_at: Date; rights: string; audience: string;
  quality_input: unknown;
};

export async function ingestVerifiedResearch(raw: unknown, client: PoolClient): Promise<{
  sourceId: string; sourceRevisionId: string; version: number; state: "researched";
}> {
  const parsed = ingestSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422, "invalid_research", "Invalid research fixture");
  const input = parsed.data;
  const current = Date.now();
  const dates = [input.publicationAt, input.observationAt, input.retrievalAt].filter((date): date is string => Boolean(date));
  if (dates.some((date) => Date.parse(date) > current) ||
      (input.publicationAt && Date.parse(input.publicationAt) > Date.parse(input.retrievalAt)) ||
      (input.observationAt && Date.parse(input.observationAt) > Date.parse(input.retrievalAt))) {
    throw new HttpFailure(422, "invalid_date", "Research evidence date is invalid");
  }
  const marker = await client.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
  if (marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 8) throw new HttpFailure(503, "unavailable", "Service unavailable");
  const customer = await client.query<{ synthetic: boolean }>(
    "SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2",
    [input.customerId, input.workspaceId]);
  if (!customer.rows[0]?.synthetic) throw hiddenRecord();
  await client.query("SELECT customer_id FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR UPDATE",
    [input.customerId, input.workspaceId]);
  const location = new URL(input.location);
  location.hash = "";
  const canonicalLocation = location.toString();
  const existing = await client.query<{ id: string }>(`SELECT id FROM evidence_sources
    WHERE workspace_id=$1 AND customer_id=$2 AND origin='independent_research'
      AND canonical_location=$3 FOR UPDATE`,
  [input.workspaceId, input.customerId, canonicalLocation]);
  const sourceId = existing.rows[0]?.id ?? randomUUID();
  if (!existing.rows[0]) await client.query(`INSERT INTO evidence_sources
    (id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity)
    VALUES ($1,$2,$3,'independent_research',$4,$5)`,
  [sourceId, input.workspaceId, input.customerId, canonicalLocation, input.trustedIdentity]);
  const previous = await client.query<PriorRevision>(`SELECT id,source_id,version,title,passage_digest,
    supported_claim,publication_at,observation_at,event_at,retrieval_at,rights,audience,quality_input
    FROM evidence_source_revisions WHERE source_id=$1 ORDER BY version DESC LIMIT 1`, [sourceId]);
  const prior = previous.rows[0];
  const digest = createHash("sha256").update(input.passage).digest("hex");
  const sameDate = (old: Date | null | undefined, next: string | undefined) =>
    (old?.toISOString() ?? null) === (next ? new Date(next).toISOString() : null);
  if (prior && prior.passage_digest === digest && prior.title === input.title &&
      prior.supported_claim === input.supportedClaim && prior.rights === input.rights &&
      prior.audience === input.audience && stableJson(prior.quality_input) === stableJson(input.qualityInput) &&
      sameDate(prior.publication_at, input.publicationAt) && sameDate(prior.observation_at, input.observationAt) &&
      sameDate(prior.event_at, input.eventAt) && sameDate(prior.retrieval_at, input.retrievalAt)) {
    return { sourceId, sourceRevisionId: prior.id, version: Number(prior.version), state: "researched" };
  }
  const version = Number(prior?.version ?? 0) + 1;
  const sourceRevisionId = randomUUID();
  await client.query(`INSERT INTO evidence_source_revisions
    (id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,
     passage_digest,publication_at,observation_at,event_at,retrieval_at,rights,audience,quality_input)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
  [sourceRevisionId, sourceId, input.workspaceId, input.customerId, version, input.location,
    input.title, input.passage, input.supportedClaim, digest, input.publicationAt ?? null,
    input.observationAt ?? null, input.eventAt ?? null, input.retrievalAt, input.rights,
    input.audience, JSON.stringify(input.qualityInput)]);
  await client.query(`INSERT INTO research_checks
    (source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,
     integrity_result,content_result,rationale)
    VALUES ($1,$2,$3,true,true,true,true,$4)`,
  [sourceRevisionId, input.trustedIdentity, input.checks.checkVersion, input.checks.rationale]);
  const evidenceAt = input.qualityInput.dateBasis === "publication" ? input.publicationAt :
    input.qualityInput.dateBasis === "observation" ? input.observationAt : undefined;
  const rated = rateEvidence({ R: input.qualityInput.R, D: input.qualityInput.D, C: input.qualityInput.C,
    informationType: input.qualityInput.informationType, dateBasis: input.qualityInput.dateBasis,
    evidenceAt: evidenceAt ? new Date(evidenceAt) : null, asOf: new Date() });
  await client.query(`INSERT INTO evidence_quality_snapshots
    (id,source_revision_id,rubric_version,rating_actor,input,information_type,date_basis,
     as_of,freshness,score,band)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [randomUUID(), sourceRevisionId, input.qualityInput.rubricVersion, input.trustedIdentity,
    JSON.stringify(input.qualityInput), input.qualityInput.informationType,
    input.qualityInput.dateBasis, rated.asOf, rated.F, rated.Q, rated.band]);
  if (prior) await client.query(`INSERT INTO evidence_source_events
    (id,source_revision_id,lifecycle_version,event_type,rationale)
    VALUES ($1,$2,1,'supersede','Trusted fixture revision replaced')`,
  [randomUUID(), prior.id]);
  await client.query(`UPDATE customer_profile_state SET version=version+1,
    internal_generation=internal_generation+1,delivery_generation=delivery_generation+$1,
    updated_at=now() WHERE customer_id=$2`,
  [input.audience === "delivery" || prior?.audience === "delivery" ? 1 : 0, input.customerId]);
  return { sourceId, sourceRevisionId, version, state: "researched" };
}
