import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ProfileCommand } from "../../contracts/profiles";
import { HttpFailure } from "../../contracts/http";
import type { ProfileActor } from "./policy";

export function commandDigest(command: ProfileCommand): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}
export async function priorProfileReceipt(client: PoolClient, actor: ProfileActor,
  customerId: string, command: ProfileCommand): Promise<unknown | null> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${actor.workspaceId}:${actor.membershipId}:${command.requestKey}`]);
  const prior = await client.query<{ customer_id: string; action: string; payload_digest: string; result: unknown }>(
    "SELECT customer_id,action,payload_digest,result FROM profile_command_receipts WHERE workspace_id=$1 AND actor_membership_id=$2 AND request_key=$3",
    [actor.workspaceId, actor.membershipId, command.requestKey]);
  const row = prior.rows[0];
  if (!row) return null;
  if (row.customer_id !== customerId || row.action !== command.action || row.payload_digest !== commandDigest(command)) {
    throw new HttpFailure(409, "request_key_conflict", "Request key already used");
  }
  return row.result;
}
export async function finishProfileReceipt(client: PoolClient, actor: ProfileActor,
  customerId: string, command: ProfileCommand, result: unknown, status = 200, receiptId = randomUUID()): Promise<void> {
  await client.query(`INSERT INTO profile_command_receipts
    (id,workspace_id,customer_id,actor_membership_id,request_key,action,payload_digest,result,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [receiptId, actor.workspaceId, customerId, actor.membershipId, command.requestKey,
    command.action, commandDigest(command), JSON.stringify(result), status]);
}
