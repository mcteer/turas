import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { profileCommandSchema } from "../../contracts/profiles";
import { priorProfileReceipt } from "../profiles/commands";
import { submitProfileCommandDetailed } from "../profiles/service";
import { lockArtifactHumanScope } from "./policy";
import { createArtifactSelection, type SelectionInput } from "./selections";

export async function submitArtifactProposal(actor: CurrentSession,
  input: { selection: SelectionInput; command: unknown },
  existingClient?: PoolClient): Promise<{ recordId: string; revisionId: string;
    reviewState: "pending"; selectionId: string; replayed: boolean }> {
  if (!input.command || typeof input.command !== "object" || Array.isArray(input.command)) {
    throw new HttpFailure(422, "invalid_command", "Proposal command required");
  }
  const rawCommand = input.command as Record<string, unknown>;
  if ("artifactSelectionDigest" in rawCommand || rawCommand.sourceExcerpt || rawCommand.sourceUrl) {
    throw new HttpFailure(422, "invalid_command", "Use exact artifact source fields");
  }
  const selectionDigest = createHash("sha256").update(JSON.stringify({
    versionId: input.selection.versionId, runId: input.selection.runId,
    lifecycleGeneration: input.selection.lifecycleGeneration, ranges: input.selection.ranges,
    excerptDigest: input.selection.excerptDigest, audience: input.selection.audience,
    dataCategory: input.selection.dataCategory,
  })).digest("hex");
  const checked = profileCommandSchema.safeParse({ ...rawCommand, artifactSelectionDigest: selectionDigest });
  if (!checked.success) throw new HttpFailure(422, "invalid_command", "Invalid profile command");
  const parsed = checked.data;
  if (parsed.action !== "propose_record" && parsed.action !== "propose_revision") {
    throw new HttpFailure(422, "invalid_command", "Proposal command required");
  }
  if (parsed.requestedAudience !== input.selection.audience ||
      parsed.dataCategory !== input.selection.dataCategory) {
    throw new HttpFailure(422, "classification_mismatch", "Claim and excerpt classification differ");
  }
  const execute = async (client: PoolClient) => {
    const scope = await client.query<{ environment_id: string; workspace_id: string;
      customer_id: string; owner_principal_id: string }>(`
      SELECT environment_id,workspace_id,customer_id,owner_principal_id
      FROM artifact_versions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    `, [input.selection.versionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
    const row = scope.rows[0];
    if (!row || row.owner_principal_id !== actor.principalId) throw hiddenRecord();
    await lockArtifactHumanScope(client, actor, { environmentId: row.environment_id,
      workspaceId: row.workspace_id, customerId: row.customer_id,
      ownerPrincipalId: row.owner_principal_id });
    const prior = await priorProfileReceipt(client, actor, row.customer_id, parsed);
    if (prior) {
      const result = prior as { recordId: string; revisionId: string; reviewState: "pending" };
      const found = await client.query<{ id: string }>(`
        SELECT id FROM artifact_evidence_selections WHERE profile_revision_id=$1
          AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4
      `, [result.revisionId,row.environment_id,row.workspace_id,row.customer_id]);
      if (!found.rows[0]) throw new Error("Artifact proposal receipt lost selection");
      return { ...result, selectionId: found.rows[0].id, replayed: true };
    }
    const selection = await createArtifactSelection(actor, input.selection, client);
    const submitted = await submitProfileCommandDetailed(actor, row.customer_id, parsed, client,
      { submissionChannel: "artifact_share", artifactSelectionId: selection.selectionId });
    const result = submitted.data as { recordId: string; revisionId: string; reviewState: "pending" };
    await client.query(`UPDATE artifact_evidence_selections SET profile_revision_id=$2,
      submitted_at=now() WHERE id=$1 AND profile_revision_id IS NULL`,
    [selection.selectionId,result.revisionId]);
    await client.query(`UPDATE artifact_versions SET submitted_at=COALESCE(submitted_at,now()),
      updated_at=now() WHERE id=$1 AND state IN ('ready','partial')`, [input.selection.versionId]);
    return { ...result, selectionId: selection.selectionId, replayed: false };
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
