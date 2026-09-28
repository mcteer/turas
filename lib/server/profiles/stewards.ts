import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";

type StewardCommand = Extract<ProfileCommand, { action: "assign_steward" | "revoke_steward" }>;
export async function changeSteward(client: PoolClient, actor: ProfileActor, customerId: string,
  command: StewardCommand): Promise<{ membershipId: string; active: boolean; version: number }> {
  if (actor.kind !== "internal" || actor.role !== "admin") throw new HttpFailure(403, "forbidden", "Action not allowed");
  const member = await client.query<{ kind: string; active: boolean }>(
    "SELECT kind,active FROM memberships WHERE id=$1 AND workspace_id=$2",
    [command.membershipId, actor.workspaceId]);
  if (member.rows[0]?.kind !== "internal" || !member.rows[0].active) throw hiddenRecord();
  const prior = await client.query<{ version: string; active: boolean }>(
    "SELECT version,active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2 FOR UPDATE",
    [customerId, command.membershipId]);
  const version = Number(prior.rows[0]?.version ?? 0);
  if (version !== command.expectedAssignmentVersion) throw new HttpFailure(409, "stale_revision", "Assignment changed; reload and retry");
  const active = command.action === "assign_steward";
  if (!prior.rows[0] && !active) throw hiddenRecord();
  if (prior.rows[0]) await client.query(
    "UPDATE customer_stewards SET active=$1,version=$2,assigned_by=$3,assigned_at=now() WHERE customer_id=$4 AND membership_id=$5",
    [active, version + 1, actor.principalId, customerId, command.membershipId]);
  else await client.query(`INSERT INTO customer_stewards
    (customer_id,workspace_id,membership_id,active,version,assigned_by)
    VALUES ($1,$2,$3,true,1,$4)`,
    [customerId, actor.workspaceId, command.membershipId, actor.principalId]);
  return { membershipId: command.membershipId, active, version: version + 1 };
}
