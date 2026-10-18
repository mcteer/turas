import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { sessionFailureDiagnostic } from "../../../../lib/server/auth/diagnostics";
import { authenticateDemoPrincipal } from "../../../../lib/server/auth/credentials";
import { checkMutationOrigin, csrfTokenForSession } from "../../../../lib/server/auth/csrf";
import { issueSession, sessionCookie } from "../../../../lib/server/auth/sessions";
import { checkLoginThrottle, recordFailedLogin, trustedLocalClientAddress } from "../../../../lib/server/auth/rate-limit";
import { getServerConfig } from "../../../../lib/server/config";
import { recordOperationalEvent } from "../../../../lib/server/observability";

const loginInput = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(1_024),
  returnTo: z.string().max(500).optional(),
}).strict();

function safeReturnPath(value: string | undefined, origin: string): string {
  if (!value || value === "/") return "/s";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    throw new HttpFailure(422, "invalid_return_path", "Invalid return path");
  }
  const parsed = new URL(value, origin);
  if (parsed.origin !== origin) throw new HttpFailure(422, "invalid_return_path", "Invalid return path");
  return parsed.pathname + parsed.search + parsed.hash;
}

function nativeLoginFailure(error: "invalid" | "unavailable", returnTo: string) {
  return new Response(null, { status: 303, headers: {
    location: `/login?error=${error}&returnTo=${encodeURIComponent(returnTo)}`,
    "Cache-Control": "private, no-store",
  } });
}

export async function POST(request: Request): Promise<Response> {
  const nativeForm = request.headers.get("content-type")?.split(";",1)[0] === "application/x-www-form-urlencoded";
  let returnTo = "/s";
  let phase = "validate";
  try {
    const config = getServerConfig();
    checkMutationOrigin(request, config);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 32 * 1_024) {
      throw new HttpFailure(413, "body_too_large", "Request too large");
    }
    let parsed: unknown;
    try { parsed = nativeForm ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text); } catch { throw new HttpFailure(422, "invalid_input", "Invalid request"); }
    const input = loginInput.safeParse(parsed);
    if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    returnTo = safeReturnPath(input.data.returnTo, config.TURAS_APP_ORIGIN);
    const clientAddress = trustedLocalClientAddress();
    await checkLoginThrottle(input.data.username, clientAddress);
    phase = "authenticate";
    const identity = await authenticateDemoPrincipal(input.data.username, input.data.password);
    if (!identity) {
      await recordFailedLogin(input.data.username, clientAddress);
      recordOperationalEvent({ action: "login", outcome: "denied", correlationId: crypto.randomUUID() });
      throw new HttpFailure(401, "invalid_credentials", "Invalid credentials");
    }
    phase = "issue_session";
    const { token, expiresAt } = await issueSession(identity);
    const response = nativeForm ? new Response(null, { status: 303,
      headers: { location: returnTo, "Cache-Control": "private, no-store" } }) : success({
      principal: { id: identity.principalId, loginName: identity.loginName, displayName: identity.displayName },
      workspace: { id: identity.workspaceId },
      membership: { kind: identity.kind, role: identity.role },
      csrfToken: csrfTokenForSession(token, config),
      returnTo,
    });
    response.headers.set("Set-Cookie", sessionCookie(token, expiresAt, config));
    recordOperationalEvent({ action: "login", outcome: "allowed", correlationId: crypto.randomUUID(), actorId: identity.principalId, workspaceId: identity.workspaceId });
    return response;
  } catch (error) {
    if (nativeForm && error instanceof HttpFailure && error.code === "invalid_credentials") {
      return nativeLoginFailure("invalid", returnTo);
    }
    const response = failure(error);
    if (response.status >= 500) {
      const diagnostic = sessionFailureDiagnostic(error);
      recordOperationalEvent({ action: "login", outcome: "failed", correlationId: crypto.randomUUID(),
        errorCode: `${phase}_${diagnostic.reason}${diagnostic.sqlState ? "_" + diagnostic.sqlState : ""}` });
    }
    if (nativeForm && response.status >= 500) return nativeLoginFailure("unavailable", returnTo);
    return response;
  }
}
