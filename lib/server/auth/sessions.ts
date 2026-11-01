import {requireSessionAdmissionOpen,operationalAdmissionOpen,protectedCancellationRequest,registerProtectedCancellation} from '../operations/session-admission';
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getServerConfig, type ServerConfig } from "../config";
import { query, withTransaction } from "../db/client";
import { appendAccessAudit } from "../access/audit";
import { HttpFailure } from "../../contracts/http";
import type { DemoIdentity } from "./credentials";

export type CurrentSession = DemoIdentity & {
  sessionId: string;
  token: string;
  expiresAt: Date;
};

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(createdAt = new Date()): Date {
  return new Date(createdAt.getTime() + 8 * 60 * 60 * 1_000);
}

export function sessionCookieName(config: ServerConfig = getServerConfig()): string {
  return config.TURAS_APP_ORIGIN.startsWith("https:") ? "__Host-turas_session" : "turas_session";
}

export function sessionCookie(token: string, expiresAt: Date, config: ServerConfig = getServerConfig()): string {
  const secure = config.TURAS_APP_ORIGIN.startsWith("https:") ? "; Secure" : "";
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  return `${sessionCookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
}

export function expiredSessionCookie(config: ServerConfig = getServerConfig()): string {
  return sessionCookie("", new Date(0), config);
}

export function tokenFromRequest(request: Request, config: ServerConfig = getServerConfig()): string | null {
  const prefix = `${sessionCookieName(config)}=`;
  const field = request.headers.get("cookie")?.split(";").map((piece) => piece.trim())
    .find((piece) => piece.startsWith(prefix));
  const token = field?.slice(prefix.length) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function issueSession(identity: DemoIdentity): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = sessionExpiresAt(createdAt);
  const sessionId = randomUUID();
  await withTransaction(async (client) => {
    await requireSessionAdmissionOpen(client);
    const eligible=await client.query(`SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id
      JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
      WHERE m.id=$1 AND m.principal_id=$2 AND m.workspace_id=$3 AND m.kind=$4 AND m.role=$5
       AND m.active AND p.active AND w.active AND (m.kind='internal' OR o.active)
       AND w.classification='primary' FOR SHARE OF m,p,w`,
      [identity.membershipId,identity.principalId,identity.workspaceId,identity.kind,identity.role]);
    if(eligible.rowCount!==1)throw new HttpFailure(401,"authentication_required","Sign in required");
    await client.query(
      `INSERT INTO login_sessions (id, principal_id, token_hash, created_at, expires_at, membership_id, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, identity.principalId, hashSessionToken(token), createdAt, expiresAt, identity.membershipId, identity.workspaceId],
    );
    await appendAccessAudit(client, { actorPrincipalId: identity.principalId,
      actorSessionId: sessionId, workspaceId: identity.workspaceId,
      action: "login", outcome: "allowed" });
  });
  return { token, expiresAt };
}

export async function getCurrentSession(request: Request, purpose:"ordinary"|"operations-status"|"cancellation"|"session-revocation"="ordinary"): Promise<CurrentSession | null> {
  const protectedStatus=purpose==='operations-status'&&request.method==='GET'&&new URL(request.url).pathname==='/api/operations/status';
  const protectedCancel=purpose==='cancellation'&&protectedCancellationRequest(request);
  const protectedRevocation=purpose==='session-revocation'&&request.method==='POST'&&new URL(request.url).pathname==='/api/auth/logout';
  if(purpose!=='ordinary'&&!protectedStatus&&!protectedCancel&&!protectedRevocation)return null;
  // An ordinary request without cookies cannot carry a session token. Requests
  // carrying cookies still pass the existing admission and session checks.
  if(purpose==='ordinary'&&!request.headers.get('cookie'))return null;
  if(!protectedStatus&&!protectedCancel&&!protectedRevocation&&!await operationalAdmissionOpen())return null;
  const token = tokenFromRequest(request);
  if (!token) return null;
  const result = await query<{
    session_id: string; principal_id: string; login_name: string; display_name: string;
    membership_id: string; workspace_id: string; kind: "internal" | "partner";
    role: "admin" | "member"; expires_at: Date; workspace_classification:"primary"|"synthetic_pilot";
  }>(`
    SELECT s.id AS session_id, s.expires_at, p.id AS principal_id, p.login_name,
           p.display_name, m.id AS membership_id, m.workspace_id, m.kind, m.role, w.classification AS workspace_classification
    FROM login_sessions s
    JOIN principals p ON p.id = s.principal_id
    JOIN memberships m ON m.principal_id = p.id AND m.id = s.membership_id AND m.workspace_id = s.workspace_id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN partner_organizations o ON o.id = m.partner_org_id AND o.workspace_id = m.workspace_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      AND p.active AND m.active AND w.active
      AND w.classification='primary'
      AND (m.kind = 'internal' OR (m.kind = 'partner' AND o.active))
    LIMIT 1
  `, [hashSessionToken(token)]);
  const row = result.rows[0];
  const actor:CurrentSession|null=row ? {
    sessionId: row.session_id,
    token,
    expiresAt: row.expires_at,
    principalId: row.principal_id,
    loginName: row.login_name,
    displayName: row.display_name,
    membershipId: row.membership_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    role: row.role,
    workspaceClassification: row.workspace_classification,
  } : null;
  if(actor&&protectedCancel)registerProtectedCancellation(request,actor);
  return actor;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query<{ principal_id: string; workspace_id: string }>(`
      SELECT s.principal_id, s.workspace_id FROM login_sessions s
      WHERE s.id = $1 FOR UPDATE
    `, [sessionId]);
    const row = result.rows[0];
    if (!row) return;
    await client.query("UPDATE login_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1", [sessionId]);
    if (!row.workspace_id) return;
    await appendAccessAudit(client, { actorPrincipalId: row.principal_id,
      actorSessionId: sessionId, workspaceId: row.workspace_id,
      action: "logout", outcome: "revoked" });
  });
}

export async function revokePrincipalSessions(principalId: string): Promise<number> {
  const result = await query(
    "UPDATE login_sessions SET revoked_at = now() WHERE principal_id = $1 AND revoked_at IS NULL",
    [principalId],
  );
  return result.rowCount ?? 0;
}
