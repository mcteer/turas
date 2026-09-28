import { eveChannel } from "eve/channels/eve";
import type { AuthFn } from "eve/channels/auth";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { composeEveRoutes } from "../../lib/server/conversations/eve-routes";
import { deriveNativeAttempt } from "../../lib/server/conversations/dispatch";
import { HttpFailure } from "../../lib/contracts/http";
import { authorizeNativeRetirement } from "../../lib/server/artifacts/native-retirement";

const appCookieAuth: AuthFn<Request> = async (request): Promise<Awaited<ReturnType<AuthFn<Request>>>> => {
  const retirementSession = new URL(request.url).pathname.match(/^\/eve\/v1\/session\/(wrun_[A-Za-z0-9_-]+)\/reset$/);
  if (request.method === "POST" && retirementSession) {
    const principalId = await authorizeNativeRetirement(request,retirementSession[1]);
    if (principalId) return { authenticator: "turas-artifact-retirement",
      principalId, principalType: "user", attributes: {} };
  }
  const session = await getCurrentSession(request);
  if (!session) return null;
  return {
    authenticator: "turas-session",
    principalId: session.principalId,
    principalType: "user",
    attributes: { workspaceId: session.workspaceId },
  };
};

export default composeEveRoutes(eveChannel({
  auth: [appCookieAuth],
  uploadPolicy: "disabled",
  turnPolicy: "queue",
  async onMessage(ctx, message) {
    if (!ctx.eve.caller || typeof message !== "string" || !ctx.eve.sessionId) {
      throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    }
    const requestKey = ctx.eve.request.headers.get("x-turas-request-key");
    if (!requestKey) throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    const session = await getCurrentSession(ctx.eve.request);
    if (!session || session.principalId !== ctx.eve.caller.principalId) {
      throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    }
    const attemptId = await deriveNativeAttempt(session, ctx.eve.sessionId, requestKey, message);
    return { auth: { ...ctx.eve.caller,
      attributes: { ...ctx.eve.caller.attributes, turasAttemptId: attemptId } } };
  },
}));
