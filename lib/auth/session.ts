import { SignJWT, jwtVerify } from "jose";
import { database, ensureDatabase } from "@/lib/db/client";

export const SESSION_COOKIE = "turas_demo_session";
const encoder = new TextEncoder();

export type AppIdentity = {
  userId: string;
  username: string;
  role: "owner" | "reviewer";
  environmentId: string;
  workspaceId: string;
  sessionId: string;
};

const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
const localSessions = new Map<string, AppIdentity & { expiresAt: number; revoked: boolean }>();

function environmentId() {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}

function sessionSecret() {
  const configured = process.env.TURAS_SESSION_SECRET;
  if (configured) return encoder.encode(configured);
  if (process.env.NODE_ENV === "production") throw new Error("TURAS_SESSION_SECRET must be configured in production.");
  return encoder.encode("local-development-only-turas-session-secret");
}

export function configuredIdentity(username: string, password: string): AppIdentity | null {
  const ownerUsername = process.env.TURAS_DEMO_USERNAME;
  const ownerPassword = process.env.TURAS_DEMO_PASSWORD;
  // Select a complete namespace; never combine a panel username with a legacy password.
  const panelConfigured = process.env.PANEL_USERNAME !== undefined || process.env.PANEL_PASSWORD !== undefined;
  const reviewerUsername = panelConfigured ? process.env.PANEL_USERNAME : process.env.TURAS_DEMO_REVIEWER_USERNAME;
  const reviewerPassword = panelConfigured ? process.env.PANEL_PASSWORD : process.env.TURAS_DEMO_REVIEWER_PASSWORD;
  const matchedOwner = ownerUsername && ownerPassword && username === ownerUsername && password === ownerPassword;
  const matchedReviewer = reviewerUsername && reviewerPassword && username === reviewerUsername && password === reviewerPassword;
  if (!matchedOwner && !matchedReviewer) return null;
  const role = matchedOwner ? "owner" : "reviewer";
  return {
    userId: `synthetic-${role}-${username.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`,
    username,
    role,
    environmentId: environmentId(),
    workspaceId: "synthetic-interview-demo",
    sessionId: crypto.randomUUID(),
  };
}

export async function createSessionToken(identity: AppIdentity) {
  return new SignJWT({
    username: identity.username,
    role: identity.role,
    environmentId: identity.environmentId,
    workspaceId: identity.workspaceId,
    sessionId: identity.sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("turas-demo")
    .setAudience("turas-web")
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_LIFETIME_SECONDS}s`)
    .sign(sessionSecret());
}

export async function registerSession(identity: AppIdentity) {
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1_000);
  const query = database();
  if (query) {
    await ensureDatabase();
    await query.query(
      "INSERT INTO turas_sessions (id, environment_id, workspace_id, user_id, username, role, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [identity.sessionId, identity.environmentId, identity.workspaceId, identity.userId, identity.username, identity.role, expiresAt.toISOString()],
    );
  } else {
    localSessions.set(identity.sessionId, { ...identity, expiresAt: expiresAt.getTime(), revoked: false });
  }
  return identity;
}

export async function verifySessionToken(token: string | undefined): Promise<AppIdentity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: "turas-demo",
      audience: "turas-web",
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "owner" && payload.role !== "reviewer") ||
      typeof payload.environmentId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.sessionId !== "string" ||
      payload.environmentId !== environmentId()
    ) return null;
    const role: AppIdentity["role"] = payload.role;
    const identity: AppIdentity = {
      userId: payload.sub,
      username: payload.username,
      role,
      environmentId: payload.environmentId,
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
    };
    return await sessionIsActive(identity) ? identity : null;
  } catch {
    return null;
  }
}

export function cookieFromHeaders(headers: Headers) {
  const raw = headers.get("cookie");
  if (!raw) return undefined;
  return raw.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export async function identityFromRequest(request: Request) {
  return verifySessionToken(cookieFromHeaders(request.headers));
}

export async function identityFromHeaders(headers: Headers) {
  return verifySessionToken(cookieFromHeaders(headers));
}

export function sessionCookie(token: string, maxAge = 60 * 60 * 8) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function revokeSession(identity: AppIdentity) {
  const query = database();
  if (query) {
    await ensureDatabase();
    await query.query("UPDATE turas_sessions SET revoked_at = now() WHERE id = $1 AND environment_id = $2 AND workspace_id = $3 AND user_id = $4 AND revoked_at IS NULL", [identity.sessionId, identity.environmentId, identity.workspaceId, identity.userId]);
  } else {
    const session = localSessions.get(identity.sessionId);
    if (session) session.revoked = true;
  }
}

async function sessionIsActive(identity: AppIdentity) {
  const query = database();
  if (query) {
    await ensureDatabase();
    const rows = await query.query("SELECT id FROM turas_sessions WHERE id = $1 AND environment_id = $2 AND workspace_id = $3 AND user_id = $4 AND revoked_at IS NULL AND expires_at > now()", [identity.sessionId, identity.environmentId, identity.workspaceId, identity.userId]);
    return rows.length === 1;
  }
  const session = localSessions.get(identity.sessionId);
  // Next development can execute a route handler and an RSC render in separate
  // workers. The production path never reaches this fallback because a database
  // is mandatory there; local development keeps the signed-cookie flow usable.
  if (!session) return process.env.NODE_ENV !== "production";
  return Boolean(session && !session.revoked && session.expiresAt > Date.now() && session.userId === identity.userId && session.environmentId === identity.environmentId && session.workspaceId === identity.workspaceId);
}
