import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { lockWorkspaceActor } from "../profiles/policy";

export type GeneralSnapshot = {
  contractVersion: "general-context-v1"; contextVersion: string;
  asOf: string; validUntil: string; entries: { citationId: string }[];
  complete: boolean; truncated: boolean;
};

export async function captureGeneralContext(db: PoolClient, actor: CurrentSession, conversationId: string, attemptId: string): Promise<void> {
  await lockWorkspaceActor(db, actor);
  if (process.env.TURAS_GENERAL_CHAT_DISABLED === "1") throw new HttpFailure(503, "general_chat_unavailable", "General chat is unavailable");
  const row = (await db.query(`SELECT 1 FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
    WHERE c.id=$1 AND a.id=$2 AND c.customer_id IS NULL AND c.context_snapshot_schema='general-context-v1'
      AND c.owner_principal_id=$3 AND c.workspace_id=$4 AND c.environment_id=$5`,
  [conversationId,attemptId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  const now = new Date(), until = new Date(Math.min(now.getTime()+120000,actor.expiresAt.getTime()));
  const digest = createHash("sha256").update(JSON.stringify(["general-context-v1",conversationId,attemptId,actor.principalId,actor.sessionId,actor.membershipId,now.toISOString(),until.toISOString()])).digest("hex");
  await db.query(`INSERT INTO general_context_receipts
    (attempt_id,conversation_id,workspace_id,environment_id,owner_principal_id,login_session_id,membership_id,as_of,valid_until,snapshot_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [attemptId,conversationId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.principalId,actor.sessionId,actor.membershipId,now,until,digest]);
}

export async function readGeneralAttemptContext(db: PoolClient, attemptId: string, principalId: string): Promise<GeneralSnapshot | null> {
  const scope = (await db.query<{ customer_id: string | null }>(`SELECT c.customer_id FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
    WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3`, [attemptId,principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!scope || scope.customer_id !== null) return null;
  if (process.env.TURAS_GENERAL_CHAT_DISABLED === "1") throw hiddenRecord();
  const row = (await db.query<{ as_of: Date; valid_until: Date; session_id: string; membership_id: string; workspace_id: string; expires_at: Date; login_name: string; display_name: string; kind: "internal" | "partner"; role: "admin" | "member" }>(`
    SELECT r.as_of,r.valid_until,r.login_session_id AS session_id,r.membership_id,r.workspace_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM general_context_receipts r JOIN conversations c ON c.id=r.conversation_id
    JOIN login_sessions s ON s.id=r.login_session_id AND s.principal_id=r.owner_principal_id
    JOIN memberships m ON m.id=r.membership_id AND m.principal_id=r.owner_principal_id AND m.workspace_id=r.workspace_id
    JOIN principals p ON p.id=r.owner_principal_id
    WHERE r.attempt_id=$1 AND r.owner_principal_id=$2 AND r.environment_id=$3
      AND c.customer_id IS NULL AND c.context_snapshot_schema='general-context-v1'
      AND c.workspace_id=r.workspace_id AND c.owner_principal_id=r.owner_principal_id
      AND s.revoked_at IS NULL AND s.expires_at>now() AND r.valid_until>now()`,
  [attemptId,principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  await lockWorkspaceActor(db, { sessionId:row.session_id, token:"", principalId, membershipId:row.membership_id, workspaceId:row.workspace_id,
    expiresAt:row.expires_at,loginName:row.login_name,displayName:row.display_name,kind:row.kind,role:row.role }, undefined, true);
  if (row.valid_until.getTime() <= Date.now()) throw hiddenRecord();
  return { contractVersion:"general-context-v1",contextVersion:"0",asOf:row.as_of.toISOString(),validUntil:row.valid_until.toISOString(),entries:[],complete:true,truncated:false };
}

/** Capability filtering supplements the server-side customer tool fence. */
export async function generalResponseScope(principal: { principalId?: string; attributes?: Record<string, unknown> } | null | undefined): Promise<boolean> {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (!principal?.principalId || typeof attemptId !== "string") return false;
  return withTransaction(async db => Boolean(await readGeneralAttemptContext(db, attemptId, principal.principalId!)));
}
