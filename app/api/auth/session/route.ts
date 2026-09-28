import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { csrfTokenForSession } from "../../../../lib/server/auth/csrf";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    return success({
      principal: { id: session.principalId, loginName: session.loginName, displayName: session.displayName },
      workspace: { id: session.workspaceId },
      membership: { id: session.membershipId, kind: session.kind, role: session.role },
      csrfToken: csrfTokenForSession(session.token),
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    return failure(error);
  }
}
