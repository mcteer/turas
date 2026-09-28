import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { artifactSelectionSchema, artifactAudienceSchema, artifactDataCategorySchema } from "../../contracts/artifacts";
import { lockArtifactHumanScope } from "./policy";

export type SelectionInput = {
  versionId: string; runId: string; lifecycleGeneration: number;
  ranges: Array<{ unitId: string; start: number; end: number }>;
  excerpt: string; excerptDigest: string;
  audience: "internal" | "delivery";
  dataCategory: "delivery_context" | "internal_operations" | "commercial" | "personnel" | "other_internal";
};

/** Selection text is reconstructed from published units; client text is only an equality check. */
export async function createArtifactSelection(actor: CurrentSession, raw: SelectionInput,
  existingClient?: PoolClient): Promise<{ selectionId: string; excerpt: string; excerptDigest: string }> {
  const { audience: rawAudience, dataCategory: rawCategory, ...exact } = raw;
  const input = artifactSelectionSchema.parse(exact);
  const audience = artifactAudienceSchema.parse(rawAudience);
  const dataCategory = artifactDataCategorySchema.parse(rawCategory);
  if (audience === "delivery" && dataCategory !== "delivery_context") {
    throw new HttpFailure(422, "invalid_classification", "Delivery excerpt needs delivery context");
  }
  if (actor.kind === "partner" && (audience !== "delivery" || dataCategory !== "delivery_context")) {
    throw hiddenRecord();
  }
  const execute = async (client: PoolClient) => {
    const scope = await client.query<{ environment_id: string; workspace_id: string; customer_id: string;
      owner_principal_id: string }>(`
      SELECT environment_id,workspace_id,customer_id,owner_principal_id
      FROM artifact_versions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    `, [input.versionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
    const scoped = scope.rows[0];
    if (!scoped || scoped.owner_principal_id !== actor.principalId) throw hiddenRecord();
    await lockArtifactHumanScope(client, actor, { environmentId: scoped.environment_id,
      workspaceId: scoped.workspace_id, customerId: scoped.customer_id,
      ownerPrincipalId: scoped.owner_principal_id });
    const current = await client.query<{ state: string; lifecycle_generation: string;
      sha256_digest: string; run_id: string | null }>(`
      SELECT v.state,v.lifecycle_generation,v.sha256_digest,r.id AS run_id
      FROM artifact_versions v LEFT JOIN artifact_extraction_runs r
        ON r.version_id=v.id AND r.state='published'
      WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4
      FOR UPDATE OF v
    `, [input.versionId,scoped.environment_id,scoped.workspace_id,scoped.customer_id]);
    const version = current.rows[0];
    if (!version || !["ready","partial"].includes(version.state) ||
        Number(version.lifecycle_generation) !== input.lifecycleGeneration ||
        version.run_id !== input.runId) throw new HttpFailure(409, "source_changed", "Source changed; reload selection");
    const ids = input.ranges.map((range) => range.unitId);
    const units = await client.query<{ id: string; ordinal: number; text: string | null;
      locator: unknown }>(`
      SELECT id,ordinal,text,locator FROM artifact_extraction_units
      WHERE id=ANY($1::uuid[]) AND run_id=$2 AND version_id=$3 AND text IS NOT NULL
    `, [ids,input.runId,input.versionId]);
    const byId = new Map(units.rows.map((row) => [row.id,row]));
    let priorOrdinal = 0;
    let priorEnd = 0;
    const slices: string[] = [];
    const presentations: Array<{ ordinal: number; locator: unknown }> = [];
    for (const range of input.ranges) {
      const unit = byId.get(range.unitId);
      if (!unit?.text) throw hiddenRecord();
      const points = Array.from(unit.text);
      if (range.end > points.length || unit.ordinal < priorOrdinal ||
          (unit.ordinal === priorOrdinal && range.start < priorEnd)) {
        throw new HttpFailure(422, "invalid_range", "Selection range changed");
      }
      slices.push(points.slice(range.start,range.end).join(""));
      presentations.push({ ordinal: unit.ordinal, locator: unit.locator });
      priorOrdinal = unit.ordinal;
      priorEnd = range.end;
    }
    const excerpt = slices.join("\n");
    const digest = createHash("sha256").update(excerpt).digest("hex");
    if (excerpt !== input.excerpt || digest !== input.excerptDigest) {
      throw new HttpFailure(409, "excerpt_mismatch", "Selection text changed; reload and retry");
    }
    if (Array.from(excerpt).length > 8_000) throw new HttpFailure(422, "selection_limit", "Selection is too long");
    const selectionId = randomUUID();
    await client.query(`INSERT INTO artifact_evidence_selections
      (id,version_id,run_id,environment_id,workspace_id,customer_id,owner_principal_id,
       author_membership_id,lifecycle_generation,original_digest,ranges,excerpt_digest,
       excerpt_char_count,audience,data_category)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [selectionId,input.versionId,input.runId,scoped.environment_id,scoped.workspace_id,
      scoped.customer_id,scoped.owner_principal_id,actor.membershipId,input.lifecycleGeneration,
      version.sha256_digest,JSON.stringify(input.ranges),digest,Array.from(excerpt).length,audience,dataCategory]);
    await client.query(`INSERT INTO artifact_evidence_payloads
      (selection_id,excerpt,source_presentation) VALUES($1,$2,$3)`,
    [selectionId,excerpt,JSON.stringify({ units: presentations })]);
    return { selectionId, excerpt, excerptDigest: digest };
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
