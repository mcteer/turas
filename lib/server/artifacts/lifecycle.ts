import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { artifactLifecycleActionSchema } from "../../contracts/artifacts";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { requireSteward } from "../profiles/policy";
import { lockArtifactHumanScope } from "./policy";
import { queueNativeRetirement } from "./native-retirement";

export function nextArtifactGeneration(current: number, expected: number): number {
  if (!Number.isSafeInteger(current) || current < 1 || current !== expected) {
    throw new HttpFailure(409, "artifact_generation_conflict", "Source version changed");
  }
  return current + 1;
}

type VersionRow = {
  id: string;
  environment_id: string;
  workspace_id: string;
  customer_id: string;
  owner_principal_id: string;
  lifecycle_generation: string;
  state: string;
  submitted_at: Date | null;
  object_key: string;
};

export type ArtifactRetirementReceipt = {
  versionId: string;
  state: "cancelled" | "withdrawn" | "deleting";
  lifecycleGeneration: number;
  eventId: string;
};

/** A tombstone is committed before any later parser, context or output may publish. */
export async function retireArtifactVersion(
  actor: CurrentSession,
  versionId: string,
  rawCommand: { action: "cancel" | "withdraw" | "delete"; expectedGeneration: number; reason: string; idempotencyKey: string },
  existingClient?: PoolClient,
): Promise<ArtifactRetirementReceipt> {
  const command = artifactLifecycleActionSchema.parse(rawCommand);
  if (!["cancel", "withdraw", "delete"].includes(command.action)) throw new HttpFailure(409, "invalid_action", "Action not allowed");
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const reason = command.reason.trim();
  const reasonDigest = createHash("sha256").update(reason).digest("hex");
  const commandDigest = createHash("sha256").update(JSON.stringify({ action: command.action, expectedGeneration: command.expectedGeneration, reason })).digest("hex");
  const execute = async (client: PoolClient): Promise<ArtifactRetirementReceipt> => {
    const scope = await client.query<VersionRow>(`
      SELECT id,environment_id,workspace_id,customer_id,owner_principal_id,
        lifecycle_generation,state,submitted_at,object_key FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    `, [versionId, environmentId, actor.workspaceId]);
    if (!scope.rows[0]) throw hiddenRecord();
    await lockArtifactHumanScope(client, actor, {
      environmentId, workspaceId: actor.workspaceId,
      customerId: scope.rows[0].customer_id, ownerPrincipalId: scope.rows[0].owner_principal_id,
    });
    const version = await client.query<VersionRow>(`
      SELECT id,environment_id,workspace_id,customer_id,owner_principal_id,
        lifecycle_generation,state,submitted_at,object_key FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE
    `, [versionId, environmentId, actor.workspaceId]);
    const row = version.rows[0];
    if (!row || row.customer_id !== scope.rows[0].customer_id) throw hiddenRecord();
    if (row.submitted_at) await requireSteward(client, actor, row.customer_id);
    else if (actor.principalId !== row.owner_principal_id) throw hiddenRecord();
    const existing = await client.query<{ command_digest: string; result: ArtifactRetirementReceipt }>(`
      SELECT command_digest,result FROM artifact_lifecycle_events
      WHERE version_id=$1 AND environment_id=$2 AND workspace_id=$3
        AND actor_principal_id=$4 AND idempotency_key=$5
    `, [versionId, environmentId, actor.workspaceId, actor.principalId, command.idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].command_digest !== commandDigest) throw new HttpFailure(409, "idempotency_conflict", "Request key already used");
      return existing.rows[0].result;
    }
    const generation = nextArtifactGeneration(Number(row.lifecycle_generation), command.expectedGeneration);
    const targetState = command.action === "delete" ? "deleting" :
      command.action === "withdraw" ? "withdrawn" : "cancelled";
    if (command.action === "cancel" && !["quarantined", "processing"].includes(row.state)) {
      throw new HttpFailure(409, "artifact_state_conflict", "Source cannot be cancelled");
    }
    if (command.action === "withdraw" && ["withdrawn", "deleting", "deleted"].includes(row.state)) {
      throw new HttpFailure(409, "artifact_state_conflict", "Source already retired");
    }
    if (command.action === "delete" && ["deleting", "deleted"].includes(row.state)) {
      throw new HttpFailure(409, "artifact_state_conflict", "Source already deleting");
    }
    await client.query(`UPDATE artifact_versions SET state=$2,lifecycle_generation=$3,updated_at=now()
      WHERE id=$1`, [versionId, targetState, generation]);
    const eventId = randomUUID();
    const result: ArtifactRetirementReceipt = { versionId, state: targetState, lifecycleGeneration: generation, eventId };
    await client.query(`
      INSERT INTO artifact_lifecycle_events
        (id,version_id,environment_id,workspace_id,customer_id,actor_membership_id,
         actor_principal_id,event_type,expected_generation,resulting_generation,
         reason_digest,reason_char_count,idempotency_key,command_digest,result)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [eventId, versionId, environmentId, actor.workspaceId, row.customer_id,
      actor.membershipId, actor.principalId, command.action, command.expectedGeneration,
      generation, reasonDigest, Array.from(reason).length, command.idempotencyKey,
      commandDigest, JSON.stringify(result)]);
    if (command.action === "delete" || command.action === "cancel") {
      const targets = [
        ["original", row.object_key], ["extraction", versionId],
        ["selection", versionId], ["draft", versionId], ["generated_history", versionId],
      ] as const;
      for (const [kind, target] of targets) {
        await client.query(`
          INSERT INTO artifact_cleanup_jobs
            (id,version_id,environment_id,workspace_id,customer_id,lifecycle_generation,target_kind,opaque_target_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (version_id,lifecycle_generation,target_kind,opaque_target_id) DO NOTHING
        `, [randomUUID(), versionId, environmentId, actor.workspaceId, row.customer_id,
          generation, kind, target]);
      }
    }
    if (command.action === "delete") await queueNativeRetirement(client,versionId,generation);
    return result;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}

/** Queue one new attempt for a failed, never-published source. */
export async function retryArtifactVersion(actor: CurrentSession, versionId: string,
  rawCommand: { action: "retry"; expectedGeneration: number; reason: string; idempotencyKey: string },
  existingClient?: PoolClient): Promise<{ versionId: string; runId: string; lifecycleGeneration: number;
    eventId: string }> {
  const command = artifactLifecycleActionSchema.parse(rawCommand);
  if (command.action !== "retry") throw new HttpFailure(422, "invalid_action", "Retry action required");
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const reason = command.reason.trim();
  const commandDigest = createHash("sha256").update(JSON.stringify({ action: "retry",
    expectedGeneration: command.expectedGeneration, reason })).digest("hex");
  const execute = async (client: PoolClient) => {
    const scope = await client.query<VersionRow>(`
      SELECT id,environment_id,workspace_id,customer_id,owner_principal_id,
        lifecycle_generation,state,submitted_at,object_key FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    `, [versionId,environmentId,actor.workspaceId]);
    if (!scope.rows[0]) throw hiddenRecord();
    await lockArtifactHumanScope(client, actor, { environmentId, workspaceId: actor.workspaceId,
      customerId: scope.rows[0].customer_id, ownerPrincipalId: scope.rows[0].owner_principal_id });
    const version = await client.query<VersionRow & { sha256_digest: string }>(`
      SELECT id,environment_id,workspace_id,customer_id,owner_principal_id,
        lifecycle_generation,state,submitted_at,object_key,sha256_digest FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE
    `, [versionId,environmentId,actor.workspaceId]);
    const row = version.rows[0];
    if (!row || row.customer_id !== scope.rows[0].customer_id) throw hiddenRecord();
    if (row.submitted_at) await requireSteward(client, actor, row.customer_id);
    else if (actor.principalId !== row.owner_principal_id) throw hiddenRecord();
    const prior = await client.query<{ command_digest: string; result: { versionId: string;
      runId: string; lifecycleGeneration: number; eventId: string } }>(`
      SELECT command_digest,result FROM artifact_lifecycle_events WHERE version_id=$1
        AND environment_id=$2 AND workspace_id=$3 AND actor_principal_id=$4
        AND idempotency_key=$5
    `, [versionId,environmentId,actor.workspaceId,actor.principalId,command.idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].command_digest !== commandDigest) throw new HttpFailure(409,
        "idempotency_conflict", "Request key already used");
      return prior.rows[0].result;
    }
    if (row.state !== "failed" || Number(row.lifecycle_generation) !== command.expectedGeneration) {
      throw new HttpFailure(409, "artifact_state_conflict", "Source is no longer retryable");
    }
    const priorRuns = await client.query<{ attempt_number: number }>(`
      SELECT attempt_number FROM artifact_extraction_runs WHERE version_id=$1
      ORDER BY attempt_number DESC,id DESC LIMIT 1`, [versionId]);
    const attemptNumber = Number(priorRuns.rows[0]?.attempt_number ?? 0) + 1;
    if (attemptNumber > 3) throw new HttpFailure(409, "retry_limit", "Retry limit reached");
    const runId = randomUUID();
    await client.query(`INSERT INTO artifact_extraction_runs
      (id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,
       initiating_principal_id,lifecycle_generation,original_digest,scan_policy_version,
       parser_policy_version,parser_image_digest,attempt_number)
      SELECT $2,id,environment_id,workspace_id,customer_id,owner_principal_id,
        $3,lifecycle_generation,sha256_digest,'004-scan-v1','004-parser-v1',
        parser_image_digest,$4 FROM artifact_versions v
      JOIN LATERAL (SELECT parser_image_digest FROM artifact_extraction_runs r
        WHERE r.version_id=v.id ORDER BY created_at DESC LIMIT 1) last_run ON true
      WHERE v.id=$1`, [versionId,runId,actor.principalId,attemptNumber]);
    await client.query(`UPDATE artifact_versions SET state='processing',safe_error_code=NULL,
      updated_at=now() WHERE id=$1`, [versionId]);
    const eventId = randomUUID();
    const result = { versionId,runId,lifecycleGeneration: command.expectedGeneration,eventId };
    await client.query(`INSERT INTO artifact_lifecycle_events
      (id,version_id,environment_id,workspace_id,customer_id,actor_membership_id,
       actor_principal_id,event_type,expected_generation,resulting_generation,
       reason_digest,reason_char_count,idempotency_key,command_digest,result)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'retry',$8,$8,$9,$10,$11,$12,$13)`,
    [eventId,versionId,environmentId,actor.workspaceId,row.customer_id,actor.membershipId,
      actor.principalId,command.expectedGeneration,createHash("sha256").update(reason).digest("hex"),
      Array.from(reason).length,command.idempotencyKey,commandDigest,JSON.stringify(result)]);
    return result;
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
