import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, withAuthChallenges } from "eve/channels/auth";
import { identityFromRequest } from "@/lib/auth/session";
import { getConversationBySession } from "@/lib/conversations/repository";

// The browser presents the same HttpOnly app cookie to the co-hosted Eve
// service. For an ID-addressed session route, ownership is checked before the
// runtime sees the request; knowing another user's durable URL is insufficient.
const demoSessionAuth: AuthFn<Request> = async (request) => {
  const identity = await identityFromRequest(request);
  if (!identity) return null;
  const sessionId = new URL(request.url).pathname.match(/\/eve\/v1\/session\/([^/]+)/)?.[1];
  if (sessionId && !(await getConversationBySession(identity, sessionId))) return null;
  return {
    authenticator: "turas-demo-cookie",
    principalId: identity.userId,
    principalType: "user",
    attributes: {
      username: identity.username,
      role: identity.role,
      environmentId: identity.environmentId,
      workspaceId: identity.workspaceId,
    },
  };
};

export default eveChannel({
  // Vercel OIDC is intentionally not a browser fallback here. The demo uses
  // app-owned identities and must not let another Vercel principal create or
  // resume an otherwise unowned session. Signed Eve callback routes retain
  // their framework authentication independently of this browser policy.
  auth: [withAuthChallenges(demoSessionAuth, [{ scheme: "Bearer" }]), localDev()],
});
