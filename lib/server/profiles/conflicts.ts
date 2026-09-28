import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { requireSteward } from "./policy";
import { validateEvidence } from "./eligibility";

type ConflictCommand = Extract<ProfileCommand, { action: "flag_conflict" | "confirm_conflict" | "resolve_conflict" }>;

export async function handleConflict(client: PoolClient, actor: ProfileActor, customerId: string,
  command: ConflictCommand): Promise<{ conflictId: string; state: string; version: number }> {
  if (command.action === "flag_conflict") {
    if (actor.kind !== "internal") throw new HttpFailure(403, "forbidden", "Action not allowed");
    if (command.firstRevisionId === command.secondRevisionId) throw new HttpFailure(422, "invalid_conflict", "Distinct revisions required");
    const found = await client.query<{ id: string }>(`SELECT v.id FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      WHERE v.id=ANY($1::uuid[]) AND v.workspace_id=$2 AND v.customer_id=$3 FOR UPDATE OF r`,
    [[command.firstRevisionId, command.secondRevisionId], actor.workspaceId, customerId]);
    if (found.rows.length !== 2) throw hiddenRecord();
    const existing = await client.query<{ id: string; state: string; version: string }>(`
      SELECT id,state,version FROM evidence_conflicts WHERE workspace_id=$1 AND customer_id=$2
        AND ((first_revision_id=$3 AND second_revision_id=$4) OR
             (first_revision_id=$4 AND second_revision_id=$3))
        AND state IN ('flagged','confirmed') FOR UPDATE`,
    [actor.workspaceId, customerId, command.firstRevisionId, command.secondRevisionId]);
    if (existing.rows[0]) return { conflictId: existing.rows[0].id,
      state: existing.rows[0].state, version: Number(existing.rows[0].version) };
    const conflictId = randomUUID();
    await client.query(`INSERT INTO evidence_conflicts
      (id,workspace_id,customer_id,first_revision_id,second_revision_id,state,rationale)
      VALUES ($1,$2,$3,$4,$5,'flagged',$6)`,
    [conflictId, actor.workspaceId, customerId, command.firstRevisionId,
      command.secondRevisionId, command.reason]);
    await client.query(`INSERT INTO evidence_conflict_events
      (id,conflict_id,version,event_type,actor_membership_id,rationale)
      VALUES ($1,$2,1,'flag',$3,$4)`,
    [randomUUID(), conflictId, actor.membershipId, command.reason]);
    return { conflictId, state: "flagged", version: 1 };
  }
  await requireSteward(client, actor, customerId);
  const current = await client.query<{ id: string; state: string; version: string;
    first_revision_id: string; second_revision_id: string }>(`SELECT id,state,version,
    first_revision_id,second_revision_id FROM evidence_conflicts
    WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 FOR UPDATE`,
  [command.conflictId, actor.workspaceId, customerId]);
  const row = current.rows[0];
  if (!row) throw hiddenRecord();
  if (Number(row.version) !== command.expectedVersion ||
      row.state !== (command.action === "confirm_conflict" ? "flagged" : "confirmed")) {
    throw new HttpFailure(409, "stale_conflict", "Conflict changed; reload and retry");
  }
  if (command.action === "resolve_conflict") {
    if (!command.resolutionRevisionIds?.length) throw new HttpFailure(422, "resolution_required", "Select current resolution evidence");
    await validateEvidence(client, actor, customerId, command.resolutionRevisionIds, row.id);
    const stillCurrent = await client.query(`SELECT count(*)::int AS count FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      WHERE v.id=ANY($1::uuid[])`, [[row.first_revision_id, row.second_revision_id]]);
    if (Number(stillCurrent.rows[0]?.count) === 2) {
      throw new HttpFailure(409, "unresolved_conflict", "Correct or retract a conflicting fact before resolving");
    }
  }
  const state = command.action === "confirm_conflict" ? "confirmed" : "resolved";
  const nextVersion = Number(row.version) + 1;
  await client.query(`UPDATE evidence_conflicts SET state=$1,version=$2,
    resolution_actor_membership_id=$3 WHERE id=$4`,
  [state, nextVersion, actor.membershipId, row.id]);
  await client.query(`INSERT INTO evidence_conflict_events
    (id,conflict_id,version,event_type,actor_membership_id,rationale)
    VALUES ($1,$2,$3,$4,$5,$6)`,
  [randomUUID(), row.id, nextVersion, state === "confirmed" ? "confirm" : "resolve",
    actor.membershipId, command.rationale]);
  const visible = await client.query(`SELECT 1 FROM profile_revisions
    WHERE id=ANY($1::uuid[]) AND audience='delivery' LIMIT 1`,
  [[row.first_revision_id, row.second_revision_id]]);
  await client.query(`UPDATE customer_profile_state SET version=version+1,
    internal_generation=internal_generation+1,
    delivery_generation=delivery_generation+$1,updated_at=now() WHERE customer_id=$2`,
  [visible.rowCount ? 1 : 0, customerId]);
  return { conflictId: row.id, state, version: nextVersion };
}
