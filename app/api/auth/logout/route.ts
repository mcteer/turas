import { failure, success } from "../../../../lib/contracts/http";
import { checkMutationOrigin, checkSessionCsrf } from "../../../../lib/server/auth/csrf";
import { expiredSessionCookie, getCurrentSession, revokeSession } from "../../../../lib/server/auth/sessions";
import { getServerConfig } from "../../../../lib/server/config";

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getServerConfig();
    checkMutationOrigin(request, config);
    const session = await getCurrentSession(request);
    if (session) {
      checkSessionCsrf(request, session, config);
      await revokeSession(session.sessionId);
    }
    const response = success({ signedOut: true });
    response.headers.set("Set-Cookie", expiredSessionCookie(config));
    return response;
  } catch (error) {
    return failure(error);
  }
}
