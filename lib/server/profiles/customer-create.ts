import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { profilePayloadSchema, type ProfilePayload } from "../../contracts/profile-payloads";
import { profileCommandSchema } from "../../contracts/profiles";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { addProposal } from "./repository";
import { enforceProfileRate } from "./rate";

const inputSchema = z.object({
  requestKey: z.uuid(),
  details: profilePayloadSchema,
}).strict().superRefine((value, ctx) => {
  if (value.details.kind !== "customer_details") {
    ctx.addIssue({ code: "custom", path: ["details"], message: "Customer details required" });
  }
});

export async function createCustomerAnchor(actor: CurrentSession, input: unknown,
  existingClient?: PoolClient): Promise<{
  data: { customerId: string; recordId: string; revisionId: string; reviewState: "pending" };
  replayed: boolean; status: number;
}> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.details.kind !== "customer_details") {
    throw new HttpFailure(422, "invalid_input", "Invalid customer details");
  }
  const { requestKey, details } = parsed.data;
  const digest = createHash("sha256").update(JSON.stringify({ action: "create_customer", details })).digest("hex");
  const run = async (client: PoolClient) => {
    await client.query("SET LOCAL lock_timeout='3000ms'");
    const member = await client.query<{ principal_id: string; kind: string; role: string; active: boolean }>(
      "SELECT principal_id,kind,role,active FROM memberships WHERE id=$1 AND workspace_id=$2 FOR UPDATE",
      [actor.membershipId, actor.workspaceId]);
    if (!member.rows[0]?.active || member.rows[0].principal_id !== actor.principalId ||
        member.rows[0].kind !== "internal" || member.rows[0].role !== "admin") {
      throw new HttpFailure(403, "forbidden", "Action not allowed");
    }
    const principal = await client.query<{ active: boolean }>("SELECT active FROM principals WHERE id=$1 FOR UPDATE", [actor.principalId]);
    const session = await client.query<{ revoked_at: Date | null; expires_at: Date }>(
      "SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1 AND principal_id=$2 FOR UPDATE",
      [actor.sessionId, actor.principalId]);
    const workspace = await client.query<{ active: boolean }>("SELECT active FROM workspaces WHERE id=$1 FOR UPDATE", [actor.workspaceId]);
    if (!principal.rows[0]?.active || !session.rows[0] || session.rows[0].revoked_at ||
        session.rows[0].expires_at.getTime() <= Date.now() || !workspace.rows[0]?.active) {
      throw new HttpFailure(401, "unauthorized", "Sign in again");
    }
    const marker = await client.query<{ environment_id: string; schema_version: number }>(
      "SELECT environment_id,schema_version FROM turas_environment LIMIT 1");
    if (marker.rows[0]?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
        marker.rows[0].schema_version < 8) throw new HttpFailure(503, "unavailable", "Service unavailable");
    await enforceProfileRate(client, actor, actor.workspaceId, "write");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [`${actor.workspaceId}:${actor.membershipId}:${requestKey}`]);
    const prior = await client.query<{ action: string; payload_digest: string;
      result: { customerId: string; recordId: string; revisionId: string; reviewState: "pending" } }>(
      "SELECT action,payload_digest,result FROM profile_command_receipts WHERE workspace_id=$1 AND actor_membership_id=$2 AND request_key=$3",
      [actor.workspaceId, actor.membershipId, requestKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].action !== "create_customer" || prior.rows[0].payload_digest !== digest) {
        throw new HttpFailure(409, "request_key_conflict", "Request key already used");
      }
      return { data: prior.rows[0].result, replayed: true, status: 200 };
    }
    const customerId = randomUUID();
    await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
      VALUES ($1,$2,'Pending customer',true)`, [customerId, actor.workspaceId]);
    await client.query(`INSERT INTO customer_stewards
      (customer_id,workspace_id,membership_id,assigned_by) VALUES($1,$2,$3,$4)`,
    [customerId, actor.workspaceId, actor.membershipId, actor.principalId]);
    const command = profileCommandSchema.parse({ requestKey, action: "propose_record",
      workloadId: null, payload: details as ProfilePayload,
      requestedAudience: "delivery", dataCategory: "delivery_context" });
    if (command.action !== "propose_record") throw new Error("Invalid customer proposal");
    const proposal = await addProposal(client, actor, customerId, command);
    const data = { customerId, ...proposal };
    await client.query(`INSERT INTO profile_command_receipts
      (id,workspace_id,customer_id,actor_membership_id,request_key,action,payload_digest,result,status)
      VALUES ($1,$2,$3,$4,$5,'create_customer',$6,$7,201)`,
    [randomUUID(), actor.workspaceId, customerId, actor.membershipId, requestKey,
      digest, JSON.stringify(data)]);
    return { data, replayed: false, status: 201 };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
